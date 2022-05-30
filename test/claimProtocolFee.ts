/* tslint:disable */
/* eslint-disable */

import {assert, expect} from "chai";
import { ethers } from "hardhat";
import { CreateContext } from "./context";

describe("claim protocol fee", function () {
    it('claim protocol fee', async function () {
        const context = await CreateContext();
        const [user, validator1] = context.users;

        await context.SKCS.connect(context.admin).addUnderlyingValidator(validator1.address, 1);

        // the first staking to the first validator
        const stakedAmount = ethers.constants.WeiPerEther;
        await context.SKCS.connect(user).depositKCS(user.address, {value: stakedAmount});

        const pendingAmount = stakedAmount.mul(2);
        await context.ValidatorsMock.increasePendingRewards(validator1.address, {value: pendingAmount});

        await context.SKCS.compound();

        const pendingRewards = pendingAmount;
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


        const before = await ethers.provider.getBalance(context.admin.address);
        const tx = await context.SKCS.connect(context.admin).claimProtocolFee(fee.sub(1000000000));
        const receipt = await tx.wait(1);
        const after = await ethers.provider.getBalance(context.admin.address);
        const gas = receipt.gasUsed.mul(tx.gasPrice||0)

        expect(after.sub(before).add(gas)).to.be.equal(fee.sub(1000000000));

    });

    it('only admin can do claim protocol fee', async function () {
        const context = await CreateContext();
        const [user, validator1] = context.users;

        await context.SKCS.connect(context.admin).addUnderlyingValidator(validator1.address, 1);

        // the first staking to the first validator
        const stakedAmount = ethers.constants.WeiPerEther;
        await context.SKCS.connect(user).depositKCS(user.address, {value: stakedAmount});

        const pendingAmount = stakedAmount.mul(2);
        await context.ValidatorsMock.increasePendingRewards(validator1.address, {value: pendingAmount});

        await context.SKCS.compound();

        expect(context.SKCS.connect(user).claimProtocolFee(1)).to.be.reverted;
    });
})