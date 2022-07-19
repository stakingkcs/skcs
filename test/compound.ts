/* tslint:disable */
/* eslint-disable */

import {assert, expect} from "chai";
import { ethers } from "hardhat";
import { CreateContext } from "./context";

describe("compound",  function () {

    it('pending rewards less than minimum staking amount', async function () {
        const context = await CreateContext(1);
        const [user1, user2,] = context.users;

        const [validator] = context.validators
        await assert((await context.SKCS.kcsBalances()).buffer.eq(0), "not equal");

        const amount = context.minStakingKCSAmount.sub(1000);
        // less than minimum staking amount, and do not claim pending rewards
        await context.ValidatorsMock.increasePendingRewards(validator.address, {value: amount});
        await context.SKCS.compound();

        await assert((await context.SKCS.kcsBalances()).buffer.eq(0), "not equal");

        await expect(await context.ValidatorsMock.pendingReward(validator.address, user1.address)).to.be.equal(amount);
    });

    it('pending rewards greater than minimum staking amount', async function () {
        const context = await CreateContext(1);
        const [user1, user2,] = context.users;

        const [validator] = context.validators
        await assert((await context.SKCS.kcsBalances()).buffer.eq(0), "not equal");


        // deposit 2 KCS
        const stakingAmount = ethers.constants.WeiPerEther.mul(2);
        await context.SKCS.connect(user1).depositKCS(user1.address, {value: stakingAmount});
        await assert((await context.SKCS.getValidatorInfo(validator.address)).stakedKCS.eq(stakingAmount));

        // greater than minimum staking amount
        const trivial = 300000;
        /// protocol fee: 10%
        const amount = context.minStakingKCSAmount.mul(12).div(10).add(trivial);
        await context.ValidatorsMock.increasePendingRewards(validator.address, {value: amount});

        await expect(await context.ValidatorsMock.pendingReward(validator.address, user1.address)).to.be.equal(amount);
        const before = (await context.SKCS.kcsBalances()).buffer;
        const tx = await context.SKCS.compound();
        const receipt = await tx.wait(1)

        //console.log("compound gas used: ", receipt.gasUsed.mul(tx.gasPrice||0));
        //console.log("compound gas used: ", ethers.utils.formatEther(receipt.gasUsed.mul(tx.gasPrice||0)));

        await expect(await context.ValidatorsMock.pendingReward(validator.address, user1.address)).to.be.equal(0);

        const feeAmount = amount.mul(1e12).mul(context.protocolFee).div(10000).div(1e12);
        await assert((await context.SKCS.kcsBalances()).fee.eq(feeAmount), "not equal");



        //console.log("buffer: ", (await context.SKCS.kcsBalances()).buffer, "pending rewards: ", await context.ValidatorsMock.pendingReward(validator.address, user1.address));
        //console.log("staked: ", (await context.SKCS.getValidatorInfo(validator.address)).stakedKCS);
        const total = (await context.SKCS.getValidatorInfo(validator.address)).stakedKCS.add((await context.SKCS.kcsBalances()).buffer).add((await context.SKCS.kcsBalances()).fee).add(await context.ValidatorsMock.pendingReward(validator.address, user1.address));
        //console.log("total = staked + buffer + pending rewards: ", ethers.utils.formatEther(total));

        await assert(total.eq(stakingAmount.add(amount)), "not equal");

    });

    it('pending rewards greater than minimum staking amount with multi-validators', async function () {

        const context = await CreateContext();
        const [user, validator1, validator2, validator3] = context.users;

        await context.SKCS.connect(context.admin).addUnderlyingValidator(validator1.address, 1);
        await context.SKCS.connect(context.admin).addUnderlyingValidator(validator2.address, 2);
        await context.SKCS.connect(context.admin).addUnderlyingValidator(validator3.address, 3);

        // the first staking to the first validator
        const stakedAmount = ethers.constants.WeiPerEther;
        await context.SKCS.connect(user).depositKCS(user.address, {value: stakedAmount});
        await context.SKCS.connect(user).depositKCS(user.address, {value: stakedAmount});
        await context.SKCS.connect(user).depositKCS(user.address, {value: stakedAmount});

        await expect(await context.SKCS.accumulatedStakedKCSAmount()).to.be.equal(stakedAmount.mul(3));


        await assert((await context.SKCS.kcsBalances()).buffer.eq(0), "not equal");

        const pendingAmount = stakedAmount.mul(2);
        await context.ValidatorsMock.increasePendingRewards(validator1.address, {value: pendingAmount});
        await context.ValidatorsMock.increasePendingRewards(validator2.address, {value: pendingAmount});
        await context.ValidatorsMock.increasePendingRewards(validator3.address, {value: pendingAmount});

        expect((await context.ValidatorsMock.totalStaked()).mul(ethers.constants.WeiPerEther)).to.be.equal(stakedAmount.mul(3));


        // console.log("validator1 stakedKCS: ", (await context.SKCS.getValidatorInfo(validator1.address)).stakedKCS);
        // console.log("validator2 stakedKCS: ", (await context.SKCS.getValidatorInfo(validator2.address)).stakedKCS);
        // console.log("validator3 stakedKCS: ", (await context.SKCS.getValidatorInfo(validator3.address)).stakedKCS);
        // console.log("totalStaked: ", (await context.ValidatorsMock.totalStaked()).mul(ethers.constants.WeiPerEther));
        // console.log("fee: ", (await context.SKCS.kcsBalances()).fee);
        // console.log("buffer: ", (await context.SKCS.kcsBalances()).buffer);

        await context.SKCS.compound();

        // console.log("validator1 stakedKCS: ", (await context.SKCS.getValidatorInfo(validator1.address)).stakedKCS);
        // console.log("validator2 stakedKCS: ", (await context.SKCS.getValidatorInfo(validator2.address)).stakedKCS);
        // console.log("validator3 stakedKCS: ", (await context.SKCS.getValidatorInfo(validator3.address)).stakedKCS);
        // console.log("totalStaked: ", (await context.ValidatorsMock.totalStaked()).mul(ethers.constants.WeiPerEther));
        // console.log("totalStaked: ", ethers.utils.formatEther((await context.ValidatorsMock.totalStaked()).mul(ethers.constants.WeiPerEther)));
        // console.log("fee: ", (await context.SKCS.kcsBalances()).fee);
        // console.log("fee: ", ethers.utils.formatEther((await context.SKCS.kcsBalances()).fee));
        // console.log("buffer: ", (await context.SKCS.kcsBalances()).buffer);
        // console.log("buffer: ", ethers.utils.formatEther((await context.SKCS.kcsBalances()).buffer));

        const pendingRewards = pendingAmount.mul(3);
        const fee = pendingRewards.mul(context.protocolFee).div(10000);
        let buffer = pendingRewards.sub(fee);
        const increments = buffer.div(ethers.constants.WeiPerEther).mul(ethers.constants.WeiPerEther);
        buffer = buffer.sub(increments);

        // console.log("fee: ", ethers.utils.formatEther(fee));
        // console.log("fee: ", fee);
        // console.log("pendingRewards: ", ethers.utils.formatEther(pendingRewards));
        // console.log("pendingRewards - fee: ", pendingRewards.sub(fee));
        // console.log("increments: ", increments);
        // console.log("buffer: ", buffer);
        // console.log("totalStaked: ", (await context.ValidatorsMock.totalStaked()).mul(ethers.constants.WeiPerEther));

        expect((await context.SKCS.getValidatorInfo(validator1.address)).stakedKCS).to.be.equal(stakedAmount);
        expect((await context.SKCS.getValidatorInfo(validator2.address)).stakedKCS).to.be.equal(stakedAmount);
        expect((await context.SKCS.getValidatorInfo(validator3.address)).stakedKCS).to.be.equal(stakedAmount.add(increments));


        // console.log("totalStaked: ", (await context.ValidatorsMock.totalStaked()).mul(ethers.constants.WeiPerEther));
        expect((await context.ValidatorsMock.totalStaked()).mul(ethers.constants.WeiPerEther)).to.be.equal(stakedAmount.mul(3).add(increments));
        expect((await context.SKCS.kcsBalances()).fee).to.be.equal(fee);
        expect((await context.SKCS.kcsBalances()).buffer).to.be.equal(buffer);

        expect(await context.SKCS.accumulatedStakedKCSAmount()).to.be.equal(stakedAmount.mul(3).add(increments).add(buffer));
        expect(await context.SKCS.accumulatedRewardKCSAmount()).to.be.equal(pendingAmount.mul(3));

    });
})