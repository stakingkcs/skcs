// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import {IsKCS} from "./interfaces/IsKCS.sol";
import {EnumerableSetUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "./interfaces/IValidator.sol";
import "./interfaces/IERC4626.sol";
import "./fifoPool.sol";
import "./interfaces/IWKCS.sol";
import "./sKCSBase.sol";


/// @title sKCS
contract sKCS is IsKCS,SKCSBase {

    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    /// @dev the initializer 
    /// @param wkcs the address of warpped KCS 
    function initialize(address wkcs, 
                        address validatorContract,
                        address processRedemptionFacet,
                        uint protocolFee,
                        uint minStakingKCSAmount,
                        uint maximumPendingRedemptionRequestPerUser,
                        address admin) external initializer{

        __Ownable_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __ERC20_init("Staked KCS","sKCS");
        __ERC20Permit_init("Staked KCS");
        __ERC20Votes_init();
        FifoPool.initialize(_redeemingPool, MAX_NUM_VALIDATORS);
        require(FifoPool.capacity(_redeemingPool) == MAX_NUM_VALIDATORS, "invalid capacity");

        WKCS = IWKCS(wkcs);
        VALIDATOR_CONTRACT = IValidators(validatorContract);

        protocolParams.protocolFee = protocolFee;
        protocolParams.minStakingKCSAmount = minStakingKCSAmount;
        protocolParams.maximumPendingRedemptionRequestPerUser = maximumPendingRedemptionRequestPerUser;
        protocolParams.minIntervalRedeemFromKCCStakingSingleValidator = 3 days;

        transferOwnership(admin);

        // facets 
        _processRedemptionFacet = IsKCSProcessRedemptionRequests(processRedemptionFacet);

    }

    function pause() external onlyOwner{
        _pause(); 
    } 

    function unpause() external onlyOwner{
        _unpause(); 
    } 



    /// @notice deposit `msg.value` KCS and send sKCS to `receiver`
    /// @dev It will staking to a specified validator by weight, when there are lots of validator.
    /// @return The amount of sKCS received by the `receiver`
    function depositKCS(address receiver)
    external
    payable
    override
    returns (uint256) {
        require(receiver != address(0), "invalid address");
        require(msg.value > 0, "invalid amount");

        (uint256 num, uint256 dem) = exchangeRate();
        // @audit Fix Item-1: Wrong calculation over user shares
        uint256 shares = msg.value * dem / num;

        _depositKCS(receiver, msg.value, shares);

        return shares;
    }

    function _depositKCS(address receiver, uint256 amount, uint256 shares) internal nonReentrant whenNotPaused{

        kcsBalances.buffer += amount;
        accumulatedStakedKCSAmount += amount;
        _tryStake();
        
        // @dev mint sKCS
        _mint(receiver,shares);

        emit Deposit(msg.sender, receiver, amount, shares);
    }


 
    /// @inheritdoc IsKCS
    function requestRedemption(uint256 _shares, address owner) external nonReentrant whenNotPaused override {

        require(_shares > 0, "Redemption: 0 shares");

        // If the gas cost of "withdrawKCS" is more than the block gas limit, the user's funds
        // will get stuck forever. We avoid this by limiting the maximum number of 
        // pending redemption requests of a user. 
        EnumerableSetUpgradeable.UintSet storage userPendingIDs = _pendingRedemptions[owner][msg.sender].pendingIDs;
        require(userPendingIDs.length() < protocolParams.maximumPendingRedemptionRequestPerUser, "Redemption: too many pending");

        if (msg.sender != owner){
            _spendAllowance(owner, msg.sender, _shares);
        }

        (uint256 num, uint256 dem) = exchangeRate();
        uint256 amountKCS = _shares * num / dem;

        // This will Possibly Change the number of holders
        _burn(owner, _shares);


        // Add a new Redemption Request to the RedemptionRequestBox. 
        uint256 id = redemptionRequestBox.length;
        // Build the redemption request 
        RedemptionRequest storage request = redemptionRequestBox.requests[id];
        request.requester = msg.sender; 
        request.amountSKCS = _shares;
        request.amountKCS = amountKCS; 
        request.timestamp = block.timestamp;
        request.accAmountKCSBefore = redemptionRequestBox.accAmountKCS;

        // update RedemptionRequestBox 
        redemptionRequestBox.accAmountKCS += request.amountKCS;
        redemptionRequestBox.length += 1;

        // Bookkeeping user's pending ID 
        userPendingIDs.add(id);


        emit NewRequestRedemption(owner, msg.sender, id, _shares, amountKCS);

    }

    /// @inheritdoc IsKCS
    function withdrawKCS(address owner, address receiver) external  override {
        _withdrawKCS(msg.sender, owner, receiver, false);
    }


    function processRedemptionRequests() external override{

        address imp = address(_processRedemptionFacet);

        assembly {
            let ptr := mload(0x40)

            calldatacopy(ptr, 0, calldatasize())
            let result := delegatecall(gas(),imp, ptr, calldatasize(), 0, 0)
            let size := returndatasize()

            returndatacopy(ptr, 0, size)

            switch result
            case 0 { revert(ptr, size) }
            default { return(ptr, size) }
        }

    }


    /// @dev other has requested redeeming owner's sKCS, and now other is withdrawing
    ///      the previously redeemed KCS and the redeemed KCS will be sent to the receiver
    function _withdrawKCS(address other, address owner, address receiver, bool wrapKCS)  internal nonReentrant whenNotPaused {

        EnumerableSetUpgradeable.UintSet storage pendingIDs =  _pendingRedemptions[owner][other].pendingIDs;
        RedemptionRequestBox storage box = redemptionRequestBox;

        uint256 amountToWithdraw = 0 ;
        uint256 amountSKCS = 0;
        
        for(uint i=0; i < pendingIDs.length();){
            uint256 id = pendingIDs.at(i);
            if (id < box.withdrawingID){
                RedemptionRequest storage r = box.requests[id];
                amountToWithdraw += r.amountKCS;
                amountSKCS += r.amountSKCS;

                // remove ID 
                pendingIDs.remove(id);

                // After removing "id" from pendingIDs,
                // pendingIDs.at(i) will change.
                // We need to check pendingIDs.at(i) again in the next loop.
                continue;
            }
            i++;   
        }
        
    
        kcsBalances.debt -= amountToWithdraw;

        if(!wrapKCS){
            AddressUpgradeable.sendValue(payable(receiver), amountToWithdraw);
        }else{
            WKCS.deposit{value: amountToWithdraw}();
            require(WKCS.transfer(receiver, amountToWithdraw), "E5");
        }

        emit Withdraw(other, receiver, owner, amountToWithdraw, amountSKCS);
    }


    function compound() external nonReentrant whenNotPaused override {
        _compound();
    }

    function _compound() internal {

        _tryRemoveDisabledValidator();

        (,uint256 pendingRewards) = _calculateProtocolFee(_calculatePendingRewards());

        // staking to KCC Staking when the balance of protocol reaches the minStakingKCSAmount
        if (kcsBalances.buffer + pendingRewards < protocolParams.minStakingKCSAmount) {
           return;
        }
        
        uint256 rewards = _claimAllPendingRewards();
        kcsBalances.buffer += rewards;
        accumulatedStakedKCSAmount += rewards;
        _tryStake();
        emit Compound(msg.sender, block.timestamp, rewards);
    }
   




    /// @param _weight is the weight of validator, _weight ∈ (0, 100]
    function addUnderlyingValidator(address _val, uint256 _weight) external onlyOwner  override {

        // @audit Fix Item 5: Unchecked validator
        require(VALIDATOR_CONTRACT.isActiveValidator(_val), "active validator only");

        require(_val != address(0), "invalid address");
        require(_weight > 0 && _weight <= 100, "invalid weight");
        require(activeValidators.length < MAX_NUM_VALIDATORS,"too many validators");

        if (_validators[_val].val == address(0)) {

            _validators[_val] = ValidatorInfo(_val, _weight, 0, 0, 0, 0, 0);

            _availablePool.add(_val);
            activeValidators.push(_val);

            protocolParams.sumOfWeight += _weight;

            emit AddValidator(msg.sender, _val, _weight);
        }
    }

    /// @notice Disable a underlying validator
    /// @dev It can be removed when the validator was in _availablePool.
    function disableUnderlyingValidator(address _val) external onlyOwner override {
        // It can't to be removed if there ware only one validator
        require(activeValidators.length > 1, "not enough validator!");

        require(_val != address(0), "invalid address");

       if (_availablePool.contains(_val)) {
           _availablePool.remove(_val);
           kcsBalances.buffer += _claimPendingRewards(_val);
           if(_validators[_val].stakedKCS > 0 ){
                VALIDATOR_CONTRACT.revokeVote(_val, (_validators[_val].stakedKCS / VOTE_UNIT));
                // @audit Fix Item 3: Unhandled staked amount
                _validators[_val].actualRedeeming = _validators[_val].stakedKCS;
                _validators[_val].userRedeeming = 0; 
                _validators[_val].stakedKCS = 0;
           }
           _disablingPool.add(_val);

           _removeActiveValidator(_val);
           emit DisablingValidator(msg.sender, _val);
       }
    }

    function _removeActiveValidator(address _val) internal returns (bool) {
        for (uint8 i = 0; i < activeValidators.length; i++) {
            if (activeValidators[i] == _val) {
                activeValidators[i] = activeValidators[activeValidators.length - 1];
                activeValidators.pop();
                return true;
            }
        }
        // it will return true when the validator is not in activeValidators array
        return true;
    }

    function updateWeightOfValidator(address _val, uint256 _weight) external onlyOwner {
        require(_val != address(0), "invalid address");
        require(_weight > 0 && _weight <= 100, "invalid weight");

        ValidatorInfo storage valInfo = _validators[_val];
        if (valInfo.val != address(0)) {
            protocolParams.sumOfWeight -= valInfo.weight;       
            valInfo.weight = _weight;
            protocolParams.sumOfWeight += valInfo.weight;       
            emit UpdateWeightOfValidator(msg.sender, _val, _weight);
        }
    }

    /// @dev withdraw the KCS and add to the buffer when the locking period of the validator in the _disablingPool has expired.
    function _tryRemoveDisabledValidator() internal {

        for (uint8 i = 0; i < _disablingPool.length(); ) {
            address val = _disablingPool.at(i);
            if (VALIDATOR_CONTRACT.isWithdrawable(address(this), val)) {
                uint256 amount = _withdrawKCSFromKCCStaking(val);
                protocolParams.sumOfWeight -= _validators[val].weight;
                _validators[val] = ValidatorInfo(address(0), 0, 0, 0, 0, 0, 0);
                kcsBalances.buffer += amount;

                _disablingPool.remove(val);

            // @audit Fix Item 3: Unhandled staked amount
            //  checker actualRedeeming rather than stakedKCS
            } else if (_validators[val].actualRedeeming == 0){
                
                protocolParams.sumOfWeight -= _validators[val].weight;
                // @audit Fix Item 6: Permanently disabled validator
                _validators[val] = ValidatorInfo(address(0), 0, 0, 0, 0, 0, 0);
                _disablingPool.remove(val); 
            }else{
                i++;   
            }
        }
    }


    function setProtocolFee(uint256 _rate) external onlyOwner override {
        require(_rate > 0 && _rate <= MAX_PROTOCOL_FEE, "invalid rate");
        require(_rate != protocolParams.protocolFee, "not changed");
        protocolParams.protocolFee = _rate;

        emit SetProtocolFeeRate(msg.sender, _rate);
    }


    /// @notice claim protocol fee
    function claimProtocolFee(uint256 amount) external nonReentrant onlyOwner {
        require(amount < kcsBalances.fee && amount > 0 , "invalid amount to claim");
       
        kcsBalances.fee -= amount;

        AddressUpgradeable.sendValue(payable(msg.sender), amount);

        emit ClaimProtocolFee(msg.sender, block.number, amount);
    }


    ///
    /// Read only methods
    ///

    /// @notice exchange rate of from KCS to sKCS
    /// @return num is the amount of total KCS in protocol
    /// @return dem is the total supply of sKCS
    function exchangeRate() public view returns(uint256 num, uint256 dem) {

        if (totalSupply() == 0) {
            // initialize exchange rate
            return (1,1);
        }

        uint256 total;
        uint256 staked;
        uint256 pendingRewards;
        uint256 residual;

        // all staked KCS and all yielded pending rewards
        (staked, pendingRewards,residual) = _totalAmountOfValidators();
        total += staked;
        total += kcsBalances.buffer;
        total += residual; // @audit Item 3: Unhandled staked amount

        // rewards with fee excluded. 
        (,uint256 rewardsExcludingFee) = _calculateProtocolFee(pendingRewards);
        total += rewardsExcludingFee;

        uint256 boxRedeemingID = redemptionRequestBox.redeemingID;
        if (redemptionRequestBox.length > boxRedeemingID) {
            // the amount of KCS of all requested redemption
            uint256 totalRedeemingAmount = redemptionRequestBox.accAmountKCS
                        - redemptionRequestBox.requests[boxRedeemingID].accAmountKCSBefore
                        - redemptionRequestBox.requests[boxRedeemingID].partiallyRedeemedKCS;
            total -= totalRedeemingAmount;
        }

        return (total, totalSupply());
    }

    // internal function
    /// @dev  Try to staking when kcsBalances.buffer greater than protocolParams.minStakingKCSAmount
    function _tryStake() internal {

        if(kcsBalances.buffer < protocolParams.minStakingKCSAmount){
            return; 
        }


        // pick a validator to staking
        address validator = _getValidatorForStaking();
        if(validator == address(0)){ // There is no available validator temporarily
            return; 
        }

        // Claim pending rewards before voting for the validator
        // 
        // Warning: If there are pending rewards from the validator,
        //    calling "vote" will automatically claim the pending rewards 
        //    and will result in wrong kcsBalances.buffer. 
        //    
        kcsBalances.buffer += _claimPendingRewards(validator);

        // processing to integer
        uint256 amount = kcsBalances.buffer / VOTE_UNIT;
        uint256 staked = amount * VOTE_UNIT;
        kcsBalances.buffer -= staked;

        _validators[validator].stakedKCS += staked;
        
        VALIDATOR_CONTRACT.vote{value: staked}(validator);
    }

    /// @notice Get a validator for staking by weight.
    function _getValidatorForStaking() internal returns (address) {

        (uint totalStaked, ,) = _totalAmountOfValidators();

        // If no KCS has been staked to any of the validators,
        // simply pick the first validator. 
        if (totalStaked== 0) {
            return activeValidators.length == 0? address(0) : activeValidators[0];
        }

        int256 minWeight = type(int256).max;
        address available;
        for (uint8 i = 0; i < activeValidators.length; i++) {
            ValidatorInfo storage info = _validators[activeValidators[i]];
            int256 pri = int256((info.stakedKCS * 1e9 / totalStaked)) - int256(info.weight * 1e9 / protocolParams.sumOfWeight);
            if (pri <= minWeight) {
                minWeight = pri;
                available = activeValidators[i];
            }
        }
        return available;
    }


    /// @notice You cannot redeem your sKCS for KCS instantly. 
    ///  The Redemption includes two separate steps:
    ///
    ///  (1) Call requestRedemption to request a redemption. 
    ///  (2) Wait for 3~6 days, then call withdrawKCS to withdraw the redeemed KCS. 
    ///
    /// This function returns the amount of KCS (assets) can be withdrawn by msg.sender, and 
    /// the amount of KCS  (assets) is corresponding to the amounts in previous redemption requests 
    /// sent by msg.sender for redeeming the owner's sKCS. 
    function withdrawable(address owner) public view returns (uint256 assets, uint256 shares){
        
        EnumerableSetUpgradeable.UintSet storage pendingIDs =  _pendingRedemptions[owner][msg.sender].pendingIDs;
        RedemptionRequestBox storage box = redemptionRequestBox;
        
        for(uint i=0; i < pendingIDs.length(); i++){
            uint256 id = pendingIDs.at(i);
            if (id < box.withdrawingID){
                RedemptionRequest storage r = box.requests[id];
                assets += r.amountKCS;
                shares += r.amountSKCS;
            }
        }
    }

    /// @notice You cannot redeem your sKCS for KCS instantly. 
    ///  The Redemption includes two separate steps:
    ///
    ///  (1) Call requestRedemption to request a redemption. 
    ///  (2) Wait for 3~6 days, then call withdrawKCS to withdraw the redeemed KCS. 
    ///
    /// This function returns the amount of KCS (assets) that is not yet withdrawable, which
    /// has been requested in previous redemption requests sent from msg.sender for 
    /// redeeming the owner's sKCS,
    /// 
    /// 
    function notWithdrawable(address owner) public view returns (uint256 assets, uint256 shares){

        EnumerableSetUpgradeable.UintSet storage pendingIDs =  _pendingRedemptions[owner][msg.sender].pendingIDs;
        RedemptionRequestBox storage box = redemptionRequestBox;
        
        for(uint i=0; i < pendingIDs.length(); i++){
            uint256 id = pendingIDs.at(i);
            if (id >= box.withdrawingID){
                RedemptionRequest storage r = box.requests[id];
                assets += r.amountKCS;
                shares += r.amountSKCS;
            }
        }
    }

    //
    // Before & After transfer hooks 
    //

    /// @dev We use _beforeTokenTransfer & _afterTokenTransfer to manage numberOfHolders
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override{
        super._beforeTokenTransfer(from,to,amount);
        numberOfHolders -=  ((balanceOf(from) != 0 ? 1: 0) + (balanceOf(to) != 0 ? 1: 0));
    }

    /// @dev We use _beforeTokenTransfer & _afterTokenTransfer to manage numberOfHolders
    function _afterTokenTransfer(address from, address to, uint256 amount) internal override{
        super._afterTokenTransfer(from,to,amount);
        numberOfHolders +=  ((balanceOf(from) != 0 ? 1: 0) + (balanceOf(to) != 0 ? 1: 0));   
    }

    //
    // fall back function
    // 

    receive() external payable {

        // @audit Fix Item 7: Implement receive logic
        require(AddressUpgradeable.isContract(msg.sender), "only contract");

        emit Receive(msg.sender, msg.value);
    }


    // 
    // Other Read-only Methods   
    // 

    function getValidatorInfo(address _val) external view returns (ValidatorInfo memory) {
        return _validators[_val];
    }


    function getRedemptionRequest(uint256 id) external view returns(RedemptionRequest memory){
        require(id < redemptionRequestBox.length,"no such id");
        return redemptionRequestBox.requests[id];
    }

    function isActiveValidator(address _val) external view returns (bool) {
        for (uint8 i = 0; i < activeValidators.length; i++) {
            if (activeValidators[i] == _val) {
                return true;
            }
        }
        return false;
    }

    function getActiveValidators() external view returns (address[] memory) {
        return activeValidators;
    }




    /*////////////////////////////////////////////////////////
    // The following methods Implement ERC4626
    ////////////////////////////////////////////////////////*/

    /// @inheritdoc IERC4626
    /// @notice The address of the underlying ERC20 token used for
    /// the Vault for accounting, depositing, and withdrawing.
    function asset() external view override returns(address _asset){
        return address(WKCS);
    }

   
    /// @inheritdoc IERC4626
    function totalAssets() external view override returns(uint256 _totalAssets) {
        (_totalAssets,  ) = exchangeRate();
        if (totalSupply() == 0) {
            _totalAssets = 0;
        }
    }
    
    /// @inheritdoc IERC4626
    /// @notice Mints `shares` Vault shares to `receiver` by
    /// depositing exactly `assets` of underlying tokens.
    function deposit(uint256 assets, address receiver) external override returns(uint256 shares) {

        // transfer WKCS from owner to sKCS Contract. 
        require(WKCS.transferFrom(msg.sender, address(this), assets),"E11");

        // withdraw KCS from WKCS contract
        WKCS.withdraw(assets);

        // calculate shares to mint 
        (uint256 num, uint256 dem) = exchangeRate();
        // @audit Fix Item-1: Wrong calculation over user shares
        shares = assets * dem / num;

        _depositKCS(receiver, assets, shares);

    }

    /// @inheritdoc IERC4626
    /// @notice Mints exactly `shares` Vault shares to `receiver`
    /// by depositing `assets` of underlying tokens.
    function mint(uint256 shares, address receiver) external override returns(uint256 assets) {

        (uint256 num, uint256 dem) = exchangeRate();
        assets = shares * dem / num;  

        // transfer WKCS from owner to sKCS Contract. 
        require(WKCS.transferFrom(msg.sender, address(this), assets),"E11");

        // withdraw WKCS to KCS 
        WKCS.withdraw(assets);

        _depositKCS(receiver, assets, shares);        

    }

    /// @inheritdoc IERC4626
    /// @notice You cannot redeem your sKCS for KCS instantly. 
    ///  The Redemption contains two separate steps:
    ///
    ///  (1) Call requestRedemption to request a redemption. 
    ///  (2) Wait for 3~6 days, and call withdrawKCS to withdraw the redeemed KCS. 
    ///  (3) `assets` must be get by calling withdrawable
    ///
    /// @param assets the amount of KCS to withdraw must be the same as that withdrawable returns. 
    function withdraw(uint256 assets, address receiver, address owner) external override returns(uint256 shares) {
        uint amount; 
        (amount, shares)=  withdrawable(owner);
        require(assets == amount,  "shares amount does not match with amount in redemption requests");

        _withdrawKCS(msg.sender, owner, receiver, true);
    }

    /// @inheritdoc IERC4626
    /// @notice You cannot redeem your sKCS for KCS instantly. 
    ///  The Redemption contains two separate steps:
    ///
    ///  (1) Call requestRedemption to request a redemption. 
    ///  (2) Wait for 3~6 days, and call withdrawKCS to withdraw the redeemed KCS. 
    ///  (3) `shares` must be get by calling withdrawable
    ///
    /// @param shares the amount of KCS to withdraw must be the same as that withdrawable returns. 
    function redeem(uint256 shares, address receiver, address owner) external override returns(uint256 assets) {
        uint sKCSAmount; 
        (assets, sKCSAmount)=  withdrawable(owner);
        require(shares == sKCSAmount, "shares amount does not match with amount in redemption requests");

        _withdrawKCS(msg.sender, owner, receiver, true);
    }

    /// @inheritdoc IERC4626
    function convertToShares(uint256 assets) external view override returns(uint256) {
       return _convertToShares(assets);
    }

    function _convertToShares(uint256 assets) internal view returns(uint256) {
        (uint256 assets_, uint256 shares_) = exchangeRate();
        return assets * shares_ / assets_;
    }

    /// @inheritdoc IERC4626
    /// @notice You cannot redeem your sKCS for KCS instantly. 
    ///  The Redemption contains two separate steps:
    ///
    ///  (1) Call requestRedemption to request a redemption. 
    ///  (2) Wait for 3~6 days, and call withdrawKCS to withdraw the redeemed KCS. 
    ///
    /// This function converts shares to assets when you call requestRedemption. 
    function convertToAssets(uint256 shares) external view override returns(uint256) {
       return _convertToAssets(shares);
    }

    function _convertToAssets(uint256 shares) internal view returns(uint256) {
        (uint256 assets_, uint256 shares_) = exchangeRate();
        return shares * assets_ / shares_ ;
    }

    /// @inheritdoc IERC4626
    /// @notice There is not limit to deposit KCS 
    function maxDeposit(address owner) external view override returns(uint256) {
        return type(uint256).max;
    }

    /// @inheritdoc IERC4626
    /// @notice There is not limit to mint sKCS
    function maxMint(address owner) external view override returns(uint256) {
        return type(uint256).max;
    }

    /// @inheritdoc IERC4626
    function previewDeposit(uint256 assets) external view override returns(uint256 shares) {
        return _convertToShares(assets);
    }

    /// @inheritdoc IERC4626
    function previewMint(uint256 shares) external view override returns(uint256 assets) {
        return _convertToAssets(shares);
    }

    /// @inheritdoc IERC4626
    function maxWithdraw(address owner) external view override returns(uint256) {
        return _convertToAssets(_maxRedeem(owner));
    }

    /// @inheritdoc IERC4626
    function previewWithdraw(uint256 assets) external view override returns(uint256 shares) {
        return _convertToShares(assets);
    }

    /// @inheritdoc IERC4626
    function maxRedeem(address owner) external view override returns(uint256) {
        return _maxRedeem(owner);
    }

    function _maxRedeem(address owner) internal view returns(uint256) {
        if(msg.sender == owner){
            return balanceOf(owner);
        }
        return MathUpgradeable.min(balanceOf(owner), allowance(owner, msg.sender));
    }

    /// @inheritdoc IERC4626
    /// @notice You cannot redeem your sKCS for KCS instantly. 
    ///  The Redemption contains two separate steps:
    ///
    ///  (1) Call requestRedemption to request a redemption. 
    ///  (2) Wait for 3~6 days, and call withdrawKCS to withdraw the redeemed KCS. 
    ///
    /// This function converts shares to assets when you call requestRedemption.    
    function previewRedeem(uint256 shares) external view override returns(uint256 assets) {
        return _convertToAssets(shares);
    }

}
