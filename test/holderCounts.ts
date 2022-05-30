/* tslint:disable */
/* eslint-disable */

import {assert, expect} from "chai";
import { ethers } from "hardhat";
import { CreateContext } from "./context";

describe("holder counter", function () {
    it('number of sKCS holders who deposit KCS to get sKCS', async function () {
        const context = await CreateContext(3);
        const [user1, user2, user3, user4, user5, user6, user7] = context.users;

        // the first staking to the first validator
        const stakedAmount = ethers.constants.WeiPerEther;
        await context.SKCS.connect(user1).depositKCS(user1.address, {value: stakedAmount});
        expect(await context.SKCS.numberOfHolders()).to.be.equal(1);

        await context.SKCS.connect(user2).depositKCS(user2.address, {value: stakedAmount});
        expect(await context.SKCS.numberOfHolders()).to.be.equal(2);

        await context.SKCS.connect(user3).depositKCS(user3.address, {value: stakedAmount});
        expect(await context.SKCS.numberOfHolders()).to.be.equal(3);

        await context.SKCS.connect(user4).depositKCS(user4.address, {value: stakedAmount});
        expect(await context.SKCS.numberOfHolders()).to.be.equal(4);

        await context.SKCS.connect(user5).depositKCS(user5.address, {value: stakedAmount});
        expect(await context.SKCS.numberOfHolders()).to.be.equal(5);


        // user1 transfer sKCS to user2, holder--
        await context.SKCS.connect(user1).transfer(user2.address, stakedAmount);
        expect(await context.SKCS.balanceOf(user1.address)).to.be.equal(0);
        expect(await context.SKCS.balanceOf(user2.address)).to.be.equal(stakedAmount.mul(2));
        expect(await context.SKCS.numberOfHolders()).to.be.equal(4);

        // a new user hold sKCS, holder++
        await context.SKCS.connect(user6).depositKCS(user6.address, {value: stakedAmount});
        expect(await context.SKCS.numberOfHolders()).to.be.equal(5);

        // user6 staking KCS, and sending sKCS to user7, holder++
        await context.SKCS.connect(user6).depositKCS(user7.address, {value: stakedAmount});
        expect(await context.SKCS.numberOfHolders()).to.be.equal(6);

        // a holder to get more sKCS, and number of holders never changed
        await context.SKCS.connect(user5).depositKCS(user5.address, {value: stakedAmount});
        expect(await context.SKCS.numberOfHolders()).to.be.equal(6);

        // user5 staking KCS, and sending sKCS to user6 who is the holder, and number of holders never changed
        await context.SKCS.connect(user5).depositKCS(user6.address, {value: stakedAmount});
        expect(await context.SKCS.numberOfHolders()).to.be.equal(6);

    });
})