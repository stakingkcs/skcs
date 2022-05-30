// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;



interface IWKCS {
 
    function deposit() external payable;
    function withdraw(uint wad) external;
 
    function totalSupply() external view returns (uint);
    function approve(address guy, uint wad) external returns (bool);
    function transfer(address dst, uint wad) external returns (bool) ;
    function transferFrom(address src, address dst, uint wad) external returns (bool);
}