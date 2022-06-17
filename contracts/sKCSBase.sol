// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import {IsKCSProcessRedemptionRequests} from "./interfaces/IsKCS.sol";
import {EnumerableSetUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";

import "./interfaces/IValidator.sol";
import "./interfaces/IERC4626.sol";
import "./fifoPool.sol";
import "./interfaces/IWKCS.sol";


/// @dev SKCSBase inherits OZ contracts and includes all the storage variables. 
///      SKCSBase also includes some common internal methods shared by different facets. 
contract SKCSBase is ReentrancyGuardUpgradeable,OwnableUpgradeable,PausableUpgradeable,ERC20VotesUpgradeable {

    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;


    /// Maximum protocol fee: 20%
    uint256 public constant MAX_PROTOCOL_FEE = 2000;
    uint256 public constant VOTE_UNIT = 1e18;
    /// @notice the maximum number of underlying validators 
    uint256 public constant MAX_NUM_VALIDATORS = 29; 

    // Wrapped KCS 
    IWKCS public  WKCS;

    // KCC Staking Contract Address 
    IValidators public  VALIDATOR_CONTRACT; // solhint-disable var-name-mixedcase


    /// @notice
    /// @dev Any validator that is enabled is either in the _redeemingPool or in the _availablePool: 
    /// 
    ///     Whenever we want to redeem from KCC Staking, we will take a validator from the _availablePool to 
    ///     handle the redemption （revokeVote from KCC Staking), and then we will move this validator to the _redeemingPool. 
    ///     After the locking period is over, we will withdraw the redeemed KCS from this validator, and then it will be
    ///     put back into the _availablePool. 
    /// 
    struct ValidatorInfo {
        address val; /// @dev  the address of the validator 
        uint256 weight; 
        uint256 stakedKCS; /// staked KCS amount in wei 
        /// The amount of KCS that is actually being redeemed from this validator (wei)
        /// Due to the restrictions by KCC staking , this must be an integer multiple of 1 ether.
        uint256 actualRedeeming; 
        /// The amount of KCS that is expected to be redeemed from this validator (wei)
        /// This can be any amount, but it must be less than or equal to actualRedeeming. 
        uint256 userRedeeming; 
        uint256 lastRedemptionTime; 
        /// When we move this validator from _redeemingPool into _availablePool, 
        /// all the redemption requests with ID < nextWithdrawingID are withdrawable. 
        uint256 nextWithdrawingID; 
    }

    // Validator Pools 
    // Any validator that is enabled is either in the _redeemingPool or in the _availablePool.
    FifoPool.Pool internal  _redeemingPool; 
    EnumerableSetUpgradeable.AddressSet internal  _availablePool;
    // _disablingPool contains the validators that are being disabled
    EnumerableSetUpgradeable.AddressSet internal  _disablingPool;  


    // The address of all active validators   
    address[] public activeValidators;
    // The detailed info of each validator 
    mapping(address => ValidatorInfo) internal _validators;


    /// @notice The request for redeeming sKCS 
    struct RedemptionRequest {
        address requester; 
        uint256 amountSKCS;  // input sKCS amount 
        uint256 amountKCS;    // ouput KCS amount 
        uint256 timestamp; 

        /// When we call processRedemptionRequests to process redemption requests, 
        /// we may not be able to process all the requests in the RedemptionRequestBox at once. 
        /// In such cases, some requests may be partially processed. 
        /// partiallyRedeemedKCS is the amount of KCS in the request has been partially processed.  
        uint256 partiallyRedeemedKCS; 
        
        /// If the ID of this RedemptionRequest is X, accAmountKCSBefore is the total amount of redeemed KCS 
        /// from all the previous RedemptionRequests in RedemptionRequestBox with an ID ∈ [0,X).
        uint256 accAmountKCSBefore;  
    }


    /// @dev The RedemptionRequestBox contains all historical RedemptionRequests 
    struct RedemptionRequestBox {
        /// All RedemptionRequests
        mapping(uint256 => RedemptionRequest) requests; 
        /// @dev redeemingID is the ID of the next RedemptionRequest to process.
        /// All the RedemptionRequest with an ID less than redeemingID have been processed. 
        /// Notice: After a RedemptionRequest has been processed, you will need to wait 
        /// for 3 days before the RedemptionRequest become withdrawable.
        uint256 redeemingID; 
        /// @dev withdrawingID can be viewed as the next ID of the RedemptionRequest which will become withrawable.
        /// And all the RedemptionRequest with an ID less than withdrawingID are withrawable.
        uint256 withdrawingID; 
        uint256 length; 
        /// @dev The total amount of redeemed KCS from all the previous RedemptionRequests.
        /// (i.e All the RedemptionRequests with an ID ∈ [0,RedemptionRequestBox.length) )
        uint256 accAmountKCS; 
    }

    RedemptionRequestBox public redemptionRequestBox;

    /// @dev The info of the pending redemptions
    struct PendingRedemptions {
        /// @dev The pending Request IDs (may contain withdrawable request)
        EnumerableSetUpgradeable.UintSet  pendingIDs;
    }

    /// @dev You cannot redeem your sKCS for KCS instantly. The Redemption contains two separate steps:
    ///  (1) Call requestRedemption to request a redemption. 
    ///  (2) Wait for 3~6 days and call withdrawKCS to withdraw the redeemed KCS. 
    ///
    /// After a user request a redemption, the ID of the RedemptionRequest will be put into _pendingRedemptions. 
    ///
    /// (1) If the owner of sKCS calls requestRedemption from his own address, the ID will be put into
    ///     _pendingRedemptions[owner][owner].pendingIDs . And only owner can withdraw the redeemded KCS later.
    // 
    /// (2) If the owner approves some sKCS to other, and the other calls requestRedemption, the ID will be 
    ///     put into _pendingRedemption[owner][other].pendingIDs . And only other can withdraw the redeemed KCS later.
    mapping(address => mapping(address => PendingRedemptions)) internal _pendingRedemptions;


    /// @notice accumulatedStakedKCSAmount is the accumulative amount of KCS deposited.
    uint256  public  accumulatedStakedKCSAmount;
    /// @notice accumulatedRewardKCSAmount is the accumulative rewards from KCC Staking.
    uint256  public  accumulatedRewardKCSAmount;
    /// @notice Number of sKCS holders 
    uint256  public  numberOfHolders;
    /// @notice The timestamp of last redemption from KCC staking 
    uint256  public  timelastRedemptionFromKCCStaking; 


    /// @notice protocol-wide parameters 
    struct ProtocolParameters {
        /// @notice unit is 1/10000
        uint256    protocolFee;
        /// @notice Minimum amount of KCS staked to KCC staking each time
        uint256    minStakingKCSAmount;
        /// @notice The maximum number of pending redemption requests of a user
        uint256    maximumPendingRedemptionRequestPerUser;
        /// @notice The minimum interval between redeeming from KCC staking if there is only 1 validator 
        uint256    minIntervalRedeemFromKCCStakingSingleValidator; 
        /// @notice The sum of weights of all the enabled validators. 
        uint256    sumOfWeight;
    }

    ProtocolParameters public protocolParams;


    struct KCSBalance{
        /// @notice The amount of KCS that should be staked to
        /// KCC staking but not yet. 
        uint256 buffer; 
        /// @notice The amount of KCS can be withdrawn by users 
        ///         who previously requested redemptions.
        uint256 debt;
        /// @notice protocol fee
        uint256 fee; 
    }

    KCSBalance public kcsBalances;

    // Diamond pattern facets 
    // each facet implements part of sKCS  
    IsKCSProcessRedemptionRequests  internal _processRedemptionFacet;

    // events
    event Compound(address sender, uint256 timestamp, uint256 claimAmount);
    event NewRequestRedemption(address indexed owner, address indexed receiver, uint256 indexed id, uint256 amountsKCS, uint256 amountKCS);
    event RedeemFromBufferOnly(uint256 indexed preRedeemingID, uint256 indexed newRedeemingID, uint256 indexed blocknumber,uint256 amount);
    event RedeemFromBufferAndKCCStaking(uint256 indexed preRedeemingID, uint256 indexed newRedeemingID, uint256 indexed blocknumber,uint256 amount);
    event AddValidator(address sender, address validator, uint256 weight);
    event DisablingValidator(address sender, address validator);
    event UpdateWeightOfValidator(address sender, address validator, uint256 weight);
    event ClaimPendingRewards(address sender, uint256 height, uint256 amount);
    event SetProtocolFeeRate(address sender, uint256 rate);
    event ClaimProtocolFee(address sender, uint256 indexed height, uint256 amount);
    event Receive(address sender, uint256 amount);


    //
    // methods shared by multiple facets 
    //

    /// @dev withdraw KCS from KCC staking 
    /// @return amount 
    function _withdrawKCSFromKCCStaking(address val) internal returns (uint256 amount){
        uint256 preBalance = address(this).balance;
        VALIDATOR_CONTRACT.withdraw(val);
        return address(this).balance - preBalance;
    }

    /// @notice claims all pending rewards
    /// @return amount of rewards
    function _claimAllPendingRewards() internal returns(uint256) {

        uint256 amount;
        for (uint8 i = 0; i < activeValidators.length; i++) {
            amount += _claimPendingRewards(_validators[activeValidators[i]].val);
        }

        emit ClaimPendingRewards(msg.sender, block.number, amount);
        return amount;
    }

    function _claimPendingRewards(address _val) internal returns (uint256) {
        require(_val != address(0), "invalid address");
        uint256 before = address(this).balance;

        // @audit Fix Item 4: Unchecked pendingReward before claiming rewards
        uint256 pending = VALIDATOR_CONTRACT.pendingReward(_val, address(this));
        if (pending == 0) {
            return 0;
        }

        VALIDATOR_CONTRACT.claimReward(_val);

        uint256 amount = address(this).balance - before;
        accumulatedRewardKCSAmount += amount;

        (uint256 fee, uint256 leftAmount) = _calculateProtocolFee(amount);
        kcsBalances.fee += fee;
        return leftAmount;
    }

    /// @notice  Calculate protocol fees
    function _calculateProtocolFee(uint256 totalAmount) internal view returns(uint256 feeAmount, uint256 leftAmount) {
        if(totalAmount == 0){
            return (0,0);
        }
        // @audit Fix Item 2: Continuous division
        feeAmount = totalAmount * 1e12 * protocolParams.protocolFee / (10000 * 1e12);
        leftAmount = totalAmount - feeAmount;
    }

    function _calculatePendingRewards() internal view returns (uint256 ) {
        uint256 total;
        for (uint8 i = 0; i < activeValidators.length; i++) {
           total += VALIDATOR_CONTRACT.pendingReward(_validators[activeValidators[i]].val, address(this));
        }
        return total;
    }

    /// @return staked The total amount of KCS staked in validators 
    /// @return pendingRewards The total amount of pending rewards from all validators 
    /// @return residual If we are redeeming from a validator, the actualRedeeming amount will always be
    ///         greater than or equal to the userRedeeming. The difference between actualRedeeming and userRedeeming
    ///         is the residual, and it will be put into the buffer later. 
    function _totalAmountOfValidators() internal view returns (uint256 staked, uint256 pendingRewards, uint256 residual) {

        for (uint8 i = 0; i < activeValidators.length; i++) {
            address val = activeValidators[i];
            // @audit Item 3: Unhandled staked amount
            staked +=  _validators[val].stakedKCS;
            residual += (_validators[val].actualRedeeming - _validators[val].userRedeeming);
            pendingRewards += VALIDATOR_CONTRACT.pendingReward(_validators[activeValidators[i]].val, address(this));
        }

        // @audit Item 3: Unhandled staked amount
        for (uint8 i = 0; i < _disablingPool.length(); i++) {
            address val = _disablingPool.at(i);
            // @audit: gas saving 
            // 
            // _validators[val].stakedKCS == 0 
            //  _validators[val].userRedeeming == 
            // 
            // staked += _validators[val].stakedKCS;  
            // residual += (_validators[val].actualRedeeming - _validators[val].userRedeeming);
            residual += _validators[val].actualRedeeming;
            
        }
    }

    
}
