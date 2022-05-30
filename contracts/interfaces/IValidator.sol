// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

interface IValidators {
    function vote(address _val) external payable;
    function pendingReward(address _val, address _user) external view returns (uint256);
    function claimReward(address _val) external;
    function revokeVote(address _val, uint256 _amount) external;
    function withdraw(address _val) external;
    function isWithdrawable(address _user, address _val) external view returns (bool);
}