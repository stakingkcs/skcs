/* tslint:disable */
/* eslint-disable */

import { expect } from "chai";
import { ethers } from "hardhat";
import { CreateContext } from "./context";

describe("Deposit KCS", function () { 

    it("Deposit without validators", async function(){

        const context = await CreateContext();
        const [user1, user2,] = context.users; 

        await expect(context.SKCS.connect(user1).depositKCS(user1.address,{
            value: ethers.constants.WeiPerEther, // 1KCS
        })).emit(context.SKCS,"Deposit").withArgs(
            user1.address,
            user1.address,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther,
        );

        expect(await context.SKCS.balanceOf(user1.address),
        "The sKCS balance of user1 should be 1 ether")
        .to.equal(ethers.constants.WeiPerEther);

    })


    it("Deposit with a validator", async function () {
        const context = await CreateContext(1);
        const [user1, user2,] = context.users;
        const [validator] = context.validators;

        await expect(context.SKCS.connect(user1).depositKCS(user1.address,{
            value: ethers.constants.WeiPerEther, // 1KCS
        })).emit(context.SKCS,"Deposit").withArgs(
            user1.address,
            user1.address,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther,
        );

        expect(await context.SKCS.balanceOf(user1.address),
            "The sKCS balance of user1 should be 1 ether sKCS")
            .to.equal(ethers.constants.WeiPerEther);
        expect((await context.SKCS.getValidatorInfo(validator.address)).stakedKCS).to.be.equal(ethers.constants.WeiPerEther);


    });


    it('user1 staking and send sKCS to user2', async function () {
        const context = await CreateContext(1);
        const [user1, user2] = context.users;
        const [validator] = context.validators;

        await expect(context.SKCS.connect(user1).depositKCS(user2.address,{
            value: ethers.constants.WeiPerEther, // 1KCS
        })).emit(context.SKCS,"Deposit").withArgs(
            user1.address,
            user2.address,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther,
        );
        expect(await context.SKCS.balanceOf(user2.address),
            "The sKCS balance of user2 should be 1 ether sKCS")
            .to.equal(ethers.constants.WeiPerEther);

        expect((await context.SKCS.getValidatorInfo(validator.address)).stakedKCS).to.be.equal(ethers.constants.WeiPerEther);
    });

    it('staking with less than 1 KCS', async function () {
        const context = await CreateContext(1);
        const [user1, user2] = context.users;
        const [validator] = context.validators;

        const amount = ethers.constants.WeiPerEther.add(20000);
        await expect(context.SKCS.connect(user1).depositKCS(user2.address,{
            value: amount,
        })).emit(context.SKCS,"Deposit").withArgs(
            user1.address,
            user2.address,
            amount,
            amount,
        );
        expect(await context.SKCS.balanceOf(user2.address),
            "The sKCS balance of user2 should be 1 ether sKCS")
            .to.equal(amount);

        expect((await context.SKCS.getValidatorInfo(validator.address)).stakedKCS).to.be.equal(amount.sub(20000));

    });

    it('staking with paused status setting', async function () {
        const context = await CreateContext(1);
        const [user] = context.users;
        const [validator] = context.validators;

        const amount = ethers.constants.WeiPerEther.sub(1000);

        // pause
        await context.SKCS.connect(context.admin).pause();
        await expect(await context.SKCS.paused()).to.be.true;

        await expect(context.SKCS.connect(user).depositKCS(user.address,{
            value: amount,
        })).emit(context.SKCS,"Deposit").withArgs(
            user.address,
            user.address,
            amount,
            amount,
        ).to.be.reverted;

        // unpause
        await context.SKCS.connect(context.admin).unpause();
        await expect(await context.SKCS.paused()).to.be.false;

        await expect(context.SKCS.connect(user).depositKCS(user.address,{
            value: amount,
        })).emit(context.SKCS,"Deposit").withArgs(
            user.address,
            user.address,
            amount,
            amount,
        );

        expect(await context.SKCS.balanceOf(user.address),
            "The sKCS balance of user2 should be 1 ether sKCS")
            .to.equal(amount);

        expect((await context.SKCS.getValidatorInfo(validator.address)).stakedKCS).to.be.equal(0);

    });

    it('select the best validator for staking', async function () {
        const context = await CreateContext();
        const [user] = context.users;
        const [validator1, validator2, validator3] = context.users;

        await context.SKCS.connect(context.admin).addUnderlyingValidator(validator1.address, 1);
        await context.SKCS.connect(context.admin).addUnderlyingValidator(validator2.address, 2);
        await context.SKCS.connect(context.admin).addUnderlyingValidator(validator3.address, 3);

        // the first staking to the first validator
        const stakedAmount = ethers.constants.WeiPerEther;
        await context.SKCS.connect(user).depositKCS(user.address, {value: stakedAmount});

        // console.log((await context.SKCS.getValidatorInfo(validator1.address)).stakedKCS);
        // console.log((await context.SKCS.getValidatorInfo(validator2.address)).stakedKCS);
        // console.log((await context.SKCS.getValidatorInfo(validator3.address)).stakedKCS);

        // the second staking only for the base validator
        await context.SKCS.connect(user).depositKCS(user.address, {value: stakedAmount});

        expect((await context.SKCS.getValidatorInfo(validator1.address)).stakedKCS).to.be.equal(stakedAmount);
        expect((await context.SKCS.getValidatorInfo(validator2.address)).stakedKCS).to.be.equal(0);
        expect((await context.SKCS.getValidatorInfo(validator3.address)).stakedKCS).to.be.equal(stakedAmount);

        await context.SKCS.connect(user).depositKCS(user.address, {value: stakedAmount});

        // console.log((await context.SKCS.getValidatorInfo(validator1.address)).stakedKCS);
        // console.log((await context.SKCS.getValidatorInfo(validator2.address)).stakedKCS);
        // console.log((await context.SKCS.getValidatorInfo(validator3.address)).stakedKCS);

        expect((await context.SKCS.getValidatorInfo(validator1.address)).stakedKCS).to.be.equal(stakedAmount);
        expect((await context.SKCS.getValidatorInfo(validator2.address)).stakedKCS).to.be.equal(stakedAmount);
        expect((await context.SKCS.getValidatorInfo(validator3.address)).stakedKCS).to.be.equal(stakedAmount);

        await context.SKCS.connect(user).depositKCS(user.address, {value: stakedAmount});

        // console.log((await context.SKCS.getValidatorInfo(validator1.address)).stakedKCS);
        // console.log((await context.SKCS.getValidatorInfo(validator2.address)).stakedKCS);
        // console.log((await context.SKCS.getValidatorInfo(validator3.address)).stakedKCS);

        expect((await context.SKCS.getValidatorInfo(validator1.address)).stakedKCS).to.be.equal(stakedAmount);
        expect((await context.SKCS.getValidatorInfo(validator2.address)).stakedKCS).to.be.equal(stakedAmount);
        expect((await context.SKCS.getValidatorInfo(validator3.address)).stakedKCS).to.be.equal(stakedAmount.add(stakedAmount));

    });

});
