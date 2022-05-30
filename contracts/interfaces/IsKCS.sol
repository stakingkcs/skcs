// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import {IERC4626} from "./IERC4626.sol";


/// @title The facet for "processRedemptionRequests"
abstract contract IsKCSProcessRedemptionRequests {

    function processRedemptionRequests() external virtual;

}



/// @title sKCS interface 
abstract contract IsKCS is IsKCSProcessRedemptionRequests,IERC4626 {

    /// @notice deposit `msg.value` KCS and send sKCS to `receiver` 
    /// @return The amount of sKCS received by the `receiver`   
    function depositKCS(address receiver) external payable virtual returns (uint256);

    /// @notice If a user wants to redeem KCS from sKCS, she/he must call 
    /// requestRedemption first, then wait for 3~6 days before calling withdrawKCS. 
    /// 
    /// @dev If the owner approves some sKCS to "the other", "the other"  can call requestRedemption 
    ///      to request redeeming the owner's sKCS. But only "the other" can later call withdrawKCS to 
    ///      withdraw the redeemed KCS. 
    /// 
    /// @param owner the owner of sKCS 
    /// @param _sKCSAmount the amount of sKCS to redeem 
    function requestRedemption(uint256 _sKCSAmount, address owner) external virtual;

    /// @notice You cannot redeem your sKCS for KCS instantly. 
    ///  The Redemption contains two separate steps:
    ///
    ///  (1) Call requestRedemption to request a redemption. 
    ///  (2) Wait for 3~6 days, and then call withdrawKCS to withdraw the redeemed KCS. 
    function withdrawKCS(address owner, address receiver) external virtual;

    function compound() external virtual; 

    function addUnderlyingValidator(address _validator, uint256 _weight) external virtual;

    function disableUnderlyingValidator(address _validator) external virtual; 

    function setProtocolFee(uint256 _rate) external virtual;




}
