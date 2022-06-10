// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./sKCSBase.sol";

/// @dev sKCSProcessRedemptionsFacet implement the logics for
///      processing redemption requests 
contract sKCSProcessRedemptionsFacet is SKCSBase, IsKCSProcessRedemptionRequests{

    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using FifoPool for FifoPool.Pool;


    /// @dev Process Redemption Requests 
    function processRedemptionRequests() external nonReentrant whenNotPaused override {

        // After redeeming from KCC staking with a validator, there is a locking period
        // before we can withdraw the redeemed KCS. Besides, before withdrawing the 
        // redeemed KCS, it is not a good idea to redeem with the same validator,
        // because the locking period will be extended. 
        // 
        // In the beginning, we will put a validator into the _availablePool pool.
        // After redeeming with this validator, we will move it into the 
        // the _redeemingPool pool. And if the locking period has passed, 
        // we can withdraw the redeemed KCS and put the validator back into 
        // the _availablePool pool. 
        // 
        _moveFromRedeemingToAvailablePool();

        RedemptionRequestBox storage box = redemptionRequestBox;

        if(box.length == box.redeemingID){
            // empty box
            return;
        }


        // The total amount of KCS pending to be redeemed
        uint256 totalPendingAmount = box.accAmountKCS - box.requests[box.redeemingID].accAmountKCSBefore -  box.requests[box.redeemingID].partiallyRedeemedKCS;

        // if the amount in the buffer is enough, we redeem all the pending amount from the buffer only. 
        // else, we claim all the pending rewards, and the pending rewards will be added to 
        // the buffer. After that, we will try to redeem all the pending amounts from the buffer again.
        // If the amount in the buffer is still not enough, we should redeem part of the pending amount
        // from KCC staking. 

        // if the amount in buffer is not enough, we will claim all pending rewards.
        if(kcsBalances.buffer < totalPendingAmount){
            kcsBalances.buffer +=  _claimAllPendingRewards();
        }

        // If we have claimed all pending rewards, the buffer may change.
        // That's why we should not put this in an "else" block. 
        if(kcsBalances.buffer >= totalPendingAmount){
            
            kcsBalances.buffer -= totalPendingAmount;
            kcsBalances.debt += totalPendingAmount;
            uint256 preRedeemingID_ = box.redeemingID;
            box.redeemingID = box.length;

            emit RedeemFromBufferOnly(preRedeemingID_, box.redeemingID, block.number, totalPendingAmount);
            return;
        }

        require(_availablePool.length() > 0, "no available validator");

        // if the amount in the buffer is still not enough 
        // we have to redeem some of the pending amounts from KCC staking

        address val = _getValidatorForRedeeming();
        require(val != address(0), "invalid address");
        // Even if we have more than 1 validators, we will still limit the interval between two redemptions from
        // KCC staking. Because this will decrease the average redemption time for users.
        require(block.timestamp - timelastRedemptionFromKCCStaking >  (protocolParams.minIntervalRedeemFromKCCStakingSingleValidator / activeValidators.length + 1),"KCC Staking Interval");

        timelastRedemptionFromKCCStaking = block.timestamp; 
        ValidatorInfo storage selectedValidator = _validators[val];

        // The amount available for redeeming 
        uint256 amountAvailable = kcsBalances.buffer + selectedValidator.stakedKCS;
        // The amount should be redeemed from KCC Staking
        uint256 amountRedeemFromKCCStaking  = 0;
        // The amount should be redeemed from buffer (i.e: empty the whole buffer)
        uint256 amountRedeemFromBuffer = kcsBalances.buffer;

        // If we have staked KCS to multiple validators, there may not be 
        // enough KCS in the "selectedValidator" for redeeming. In this case, 
        // amountAvailable could be less than totalPendingAmount and 
        // `newRedeemingID` will be less than box.length 
        // 
        // (1) if newRedeemingID == box.length, we are able to redeem all
        //     the pending requests in the RedemptionRequestBox. 
        // (2) if newRedeemingID < box.length, only some of the pending requests
        //     in the RedemptionRequestBox can be redeemed. And the request with 
        //     ID == newRedeemingID may be only paritially redeemed or not be redeemed. 
        uint256 newRedeemingID = _findNewRedeemingID(amountAvailable);
        
        if(newRedeemingID < box.length){
            // newRedeemingID < box.length
            // only some of the pending requests in the RedemptionRequestBox can be redeemed.

            // If request with ID == newRedeemingID is partially redeemed,
            // we should update "partiallyRedeemedKCS" in that request. 

            uint256 amountToRedeemExcludeNewRedeemID =  box.requests[newRedeemingID].accAmountKCSBefore - 
                    box.requests[box.redeemingID].accAmountKCSBefore - 
                    box.requests[box.redeemingID].partiallyRedeemedKCS;

            uint256 remaining = amountAvailable -  amountToRedeemExcludeNewRedeemID;

            box.requests[newRedeemingID].partiallyRedeemedKCS = remaining;

            amountRedeemFromKCCStaking  = amountAvailable - kcsBalances.buffer;
        }else{
            // newRedeemingID == box.length 
            // We are able to redeem all the pending requests in the RedemptionRequestBox.
            amountRedeemFromKCCStaking = totalPendingAmount - kcsBalances.buffer;
        }

        // update box 
        uint256 preRedeemingID = box.redeemingID;
        box.redeemingID = newRedeemingID;
        

        // Redeeming from buffer 
        // i.e: move KCS from buffer to debt
        kcsBalances.debt += kcsBalances.buffer;
        kcsBalances.buffer = 0;

        // Redeeming from KCC Staking 
        // There is a constraint on the amount to stake/redeem from KCC Staking.
        // The amount staked to or withdrawn from KCC staking must be integer multiples of 
        // 1 ether KCS. So, the actual redeemed amount of KCS may be different from 
        // amountRedeemFromKCCStaking. 
        uint256 actualAmountRedeemFromKCCStaking = MathUpgradeable.ceilDiv(amountRedeemFromKCCStaking,VOTE_UNIT)*VOTE_UNIT;


        // update selectedValidator
        selectedValidator.stakedKCS -= actualAmountRedeemFromKCCStaking;
        selectedValidator.actualRedeeming = actualAmountRedeemFromKCCStaking;
        selectedValidator.userRedeeming = amountRedeemFromKCCStaking;
        selectedValidator.lastRedemptionTime = block.timestamp;
        selectedValidator.nextWithdrawingID = newRedeemingID;

        // move validator from available pool to redeeming pool 
        require(_availablePool.remove(selectedValidator.val),"cannot remove validator from available pool");
        _redeemingPool.add(selectedValidator.val);

        // execute the redemption 
        // notice: now, there should be no any pending rewards 
        VALIDATOR_CONTRACT.revokeVote(selectedValidator.val, actualAmountRedeemFromKCCStaking);

        emit RedeemFromBufferAndKCCStaking(preRedeemingID, box.redeemingID, block.number, amountRedeemFromBuffer + amountRedeemFromKCCStaking);
    }



    /// @dev Move withdrawable validators from the _redeemingPool pool
    /// to the _availablePool pool 
    function _moveFromRedeemingToAvailablePool() internal{

        RedemptionRequestBox storage box = redemptionRequestBox;

        // FIXME: the number of validators is less than 30 ? 
        while(_redeemingPool.size() >0){

            // The head validator in the pool 
            address valAddress = _redeemingPool.peek();

            if (!VALIDATOR_CONTRACT.isWithdrawable(address(this), valAddress)){
                // not withdrawable yet 
                break;
            }

            // withdraw from KCC Staking 
            uint256 amount = _withdrawKCSFromKCCStaking(valAddress);
            ValidatorInfo storage val = _validators[valAddress];

            require(amount == val.actualRedeeming,"mismatched amount");

            // update balance 
            kcsBalances.debt += val.userRedeeming; 
            kcsBalances.buffer += (val.actualRedeeming - val.userRedeeming);

            // udpate box 
            box.withdrawingID = val.nextWithdrawingID;

            // reset validator 
            // FIXME: Is it really necessary to reset ?
            // Dirty slots will save more gas when you write to them.
            val.actualRedeeming = 0; 
            val.userRedeeming = 0;

            // Move from the redeeming Pool to the available pool 
            _redeemingPool.pop();
            require(_availablePool.add(valAddress),"cannot add valiator to available pool");

        }

        // If the _redeemingPool pool is empty, there will be no validator redeeming.
        // But box.withdrawingID != box.redeemingID can still be possible if we redeemed from only buffer
        // or buffer+pendingRewards in the last call of processRedemptionRequests.
        if(_redeemingPool.size() == 0 && box.withdrawingID != box.redeemingID){
            box.withdrawingID = box.redeemingID;
        }
    
    }


    /// @param amountAvailable The amount available to process redemption requests
    /// @return newRedeemingID 
    /// @dev 
    /// (1) if newRedeemingID == box.length, we are able to redeem all
    ///     the pending requests in the RedemptionRequestBox. 
    /// (2) if newRedeemingID < box.length, only some of the pending requests
    ///     in the RedemptionRequestBox can be redeemed. And the request with 
    ///     ID == newRedeemingID may be only partially redeemed or not be redeemed.
    function _findNewRedeemingID(uint256 amountAvailable)  internal view returns(uint256 newRedeemingID) {
        RedemptionRequestBox storage box = redemptionRequestBox;

        // total pending amount of KCS to be redeemed 
        uint256 totalPendingAmount = box.accAmountKCS 
                    - box.requests[box.redeemingID].accAmountKCSBefore 
                    - box.requests[box.redeemingID].partiallyRedeemedKCS;

        if(amountAvailable >= totalPendingAmount){
            // all the pending requests in the box can be redeemed
            return box.length;
        }

        // binary search 
        {
            uint256 L = box.redeemingID; // request with lower ID
            uint256 H = box.length - 1;  // request with higher ID 
            while(L != H){
                uint256 M = MathUpgradeable.ceilDiv(L + H, 2);

                // accumulated amount from box.redeemingID to M - 1
                // preCondition M != L
                uint256 accAmount = box.requests[M].accAmountKCSBefore 
                        - box.requests[box.redeemingID].accAmountKCSBefore 
                        - box.requests[box.redeemingID].partiallyRedeemedKCS;
                if (accAmount >= amountAvailable){
                    H = M;
                }else{
                    L = M;
                }
            }

            return H;
        }

    }


    /// @dev Pick a validator in _availablePool to redeem from KCC staking. 
    /// @dev Return zero address if _availablePool is empty. 
    function _getValidatorForRedeeming() internal view returns (address) {
       
        (uint totalStaked, ) = _totalAmountOfValidators();

        int256 maxWeight = type(int256).min;
        address available = address(0);
        uint256 length = EnumerableSetUpgradeable.length(_availablePool);
        for (uint8 i = 0; i < length; i++) {
            address val = _availablePool.at(i);

            ValidatorInfo storage info = _validators[val];
            if (info.stakedKCS == 0) {
                continue;
            }
            int256 pri = int256((info.stakedKCS * 1e9 / totalStaked)) - int256(info.weight * 1e9 / protocolParams.sumOfWeight);
            if (pri >= maxWeight) {
                maxWeight = pri;
                available = val;
            }
        }

        return available;
    }


}