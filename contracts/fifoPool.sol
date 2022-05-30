// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;


library FifoPool{

    /// @dev A fifo implemented with fixed length ring buffer
    struct Pool {
        address[] _buffer;   // the array storing the entries 
        uint256  _nextWrite; // The index of the next entry to write
        uint256  _nextRead;  // The index of the next entry to read
    }

    /// @dev initialize the pool, you can only call this once
    function initialize(Pool storage p, uint256 length) internal{
        address[] storage buffer = p._buffer;
        
        // FIXME: Gas saving with Yul?
        // assembly { sstore(buffer.slot, length) }

        for(uint i =0; i< length; i++){
            buffer.push(address(0));
        }

        require(buffer.length == length, "reinitialized");
    }

    /// @dev the capacity of the pool, i.e, the maximum elements can be
    /// stored in the pool 
    function capacity(Pool storage p) internal view returns(uint256){
        return p._buffer.length;
    }

    /// @dev the number of elements in the pool 
    function size(Pool storage p) internal view returns(uint256){
        return p._nextWrite - p._nextRead;
    }

    /// @dev Peek the next entry to read if not emtpy
    function peek(Pool storage p) internal view returns(address){
        require(p._nextRead != p._nextWrite, "empty");
        return p._buffer[p._nextRead % p._buffer.length];
    }

    /// @dev Pop the next entry to read if not empty
    function pop(Pool storage p) internal returns(address){
        address e = peek(p);
        
        p._nextRead++;
        return e;
    }

    /// @dev Write entry if not full
    function add(Pool storage p, address e) internal{
        require(p._nextWrite - p._nextRead < p._buffer.length,"full");

        p._buffer[p._nextWrite % p._buffer.length] = e;
        p._nextWrite++;
    }

}
