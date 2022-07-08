// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "../interfaces/IValidator.sol";


/// @dev The mock contract for validators.
/// This mock assumes there is only one staker (i.e, our SKCS contract.)
contract ValidatorsMock is IValidators{

    /// @dev The only staker(sKCS Contract)'s voting info on each validator. 
    struct StakerVotingInfo{
        uint256  votes; /// @dev number of ballots voted to the validator
        uint256  revoking;    /// @dev number of ballots revoking from the validator 
        uint256  pendingRewards; /// @dev pendingRewards in wei from the validator 
    }

    uint256 public totalStaked;

    /// @dev  a mapping of validator address to sKCS's voting info. 
    mapping( address => StakerVotingInfo) public  validatorsVotes;

    function increasePendingRewards(address val) public payable{
        validatorsVotes[val].pendingRewards += msg.value;
    }

    /// @dev assume msg.sender is sKCS contract only 
    function vote(address _val) external override payable{
        require(msg.value % 1 ether == 0, "must be multiple times of 1 ether" );
        validatorsVotes[_val].votes += msg.value / (1 ether);
        totalStaked += msg.value / (1 ether);
    }

    /// @dev user is sKCS contract, and ignored. 
    function pendingReward(address _val, address _user) external override  view returns (uint256){
        return validatorsVotes[_val].pendingRewards;
    }
    
    /// @dev msg.sender is sKCS 
    function claimReward(address _val) external override{
        uint256 amount  = validatorsVotes[_val].pendingRewards;
        validatorsVotes[_val].pendingRewards = 0; 
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "failed to send value");    
    }
    
    /// @dev msg.sender is sKCS 
    function revokeVote(address _val, uint256 votes) external override{
        validatorsVotes[_val].votes -= votes;
        validatorsVotes[_val].revoking += votes;
        totalStaked -= votes;
    }
    
    /// @dev msg.sender is sKCS 
    function withdraw(address _val) external override{
        uint256 votes = validatorsVotes[_val].revoking;
        require(votes != 0, "no amount revoking");
        validatorsVotes[_val].revoking = 0;
        (bool success, ) = msg.sender.call{value: votes * (1 ether)}("");
        require(success, "failed to send value");           
    }
    
    function isWithdrawable(address _user, address _val) external override view returns (bool){
        return validatorsVotes[_val].revoking != 0;
    }

    function isActiveValidator(address _val) external override view returns (bool) {
        return true;
    }

}