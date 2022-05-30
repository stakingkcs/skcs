import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { CreateContext } from "./context";

describe("Request Redemption", function () {

    // context for testing 
    let ctx: Awaited<ReturnType<typeof CreateContext>>;
    // user1 and user2 for testing 
    let user1: SignerWithAddress, user2: SignerWithAddress;
    // 100 KCS 
    const _100KCS = ethers.utils.parseUnits("100", "ether");
    // the underlying validator
    let underlyingValidator: SignerWithAddress; 

    this.beforeEach(async () => {
        // create context with 1 validators 
        ctx = await CreateContext(1);
        [user1, user2,] = ctx.users;
        [underlyingValidator,] = ctx.validators

        // user1 and user2 each deposits 100 KCS 
        await ctx.SKCS.connect(user1).depositKCS(user1.address, {
            value: _100KCS,
        });
        await ctx.SKCS.connect(user2).depositKCS(user2.address, {
            value: _100KCS,
        });

        expect(await ctx.SKCS.balanceOf(user1.address)).eq(_100KCS);
        expect(await ctx.SKCS.balanceOf(user2.address)).eq(_100KCS);

    })

    it("user1 requests the redemption of his own 1 sKCS", async function () {

        let expectedID = (await ctx.SKCS.redemptionRequestBox())[2];

        // shares to redeem 
        const shares = ethers.constants.WeiPerEther;
        // assets (KCS) can be redeemed 
        const KCSAmount = await ctx.SKCS.convertToAssets(shares);

        await expect(
            ctx.SKCS.connect(user1).requestRedemption(shares, user1.address)
        ).emit(
            ctx.SKCS, "NewRequestRedemption"
        ).withArgs(
            user1.address, // owner
            user1.address, // receiver 
            expectedID, // id 
            shares, //  shares 
            KCSAmount // KCS Amount 
        );

        // get the redemption request 
        const { requester,
            amountKCS,
            amountSKCS,
            timestamp,
            partiallyRedeemedKCS,
            accAmountKCSBefore } = await ctx.SKCS.getRedemptionRequest(expectedID);
        
        expect(requester).eq(user1.address);
        expect(amountKCS).eq(KCSAmount);
        expect(amountSKCS).eq(shares);
        expect(partiallyRedeemedKCS).eq(0);
        expect(accAmountKCSBefore).eq(0);

        // assert redemption box 
        const [
            redeemingID,
            withdrawingID,
            length,
            accAmountKCS
        ] = await ctx.SKCS.redemptionRequestBox();
        
        expect(redeemingID).eq(0);
        expect(withdrawingID).eq(0);
        expect(length).eq(1);
        expect(accAmountKCS).eq(KCSAmount);

        // assert withdrawable amount 
        const withdrawable = await ctx.SKCS.connect(user1).withdrawable(user1.address);
        expect(withdrawable.assets).eq(0);
        expect(withdrawable.shares).eq(0);

        // assert notWithdrawable amount 
        const notWithdrawable = await ctx.SKCS.connect(user1).notWithdrawable(user1.address);
        expect(notWithdrawable.assets).eq(KCSAmount);
        expect(notWithdrawable.shares).eq(shares);  

    });
    
    it("user2 requests the redemption of user1's 1 sKCS", async function () {

        let expectedID = (await ctx.SKCS.redemptionRequestBox())[2];

        // shares to redeem 
        const shares = ethers.constants.WeiPerEther;
        // assets (KCS) can be redeemed 
        const KCSAmount = await ctx.SKCS.convertToAssets(shares);

        


        // user1 approves 1sKCS to be spent by user2 
        await ctx.SKCS.connect(user1).approve(user2.address,shares);

        await expect(
            ctx.SKCS.connect(user2).requestRedemption(shares, user1.address)
        ).emit(
            ctx.SKCS, "NewRequestRedemption"
        ).withArgs(
            user1.address, // owner
            user2.address, // receiver 
            expectedID, // id 
            shares, //  shares 
            KCSAmount // KCS Amount 
        );

        // get the redemption request 
        const { requester,
            amountKCS,
            amountSKCS,
            timestamp,
            partiallyRedeemedKCS,
            accAmountKCSBefore } = await ctx.SKCS.getRedemptionRequest(expectedID);
        
        expect(requester).eq(user2.address); // requested by user2
        expect(amountKCS).eq(KCSAmount);
        expect(amountSKCS).eq(shares);
        expect(partiallyRedeemedKCS).eq(0);
        expect(accAmountKCSBefore).eq(0);

        // assert redemption box 
        const [
            redeemingID,
            withdrawingID,
            length,
            accAmountKCS
        ] = await ctx.SKCS.redemptionRequestBox();
        
        expect(redeemingID).eq(0);
        expect(withdrawingID).eq(0);
        expect(length).eq(1);
        expect(accAmountKCS).eq(KCSAmount);

        // assert withdrawable amount 
        const withdrawable = await ctx.SKCS.connect(user1).withdrawable(user1.address);
        expect(withdrawable.assets).eq(0);
        expect(withdrawable.shares).eq(0);

        // notWithdrawable amount by user1 is zero
        let notWithdrawable = await ctx.SKCS.connect(user1).notWithdrawable(user1.address);
        expect(notWithdrawable.assets).eq(0);
        expect(notWithdrawable.shares).eq(0);
        
        // notWithdrawable amount by user2 
        notWithdrawable = await ctx.SKCS.connect(user2).notWithdrawable(user1.address);
        expect(notWithdrawable.assets).eq(KCSAmount);
        expect(notWithdrawable.shares).eq(shares);        

    });


    it("user1 requests the redemption of his own 1 sKCS (with profits)", async function () {

        // fake some profits
        await ctx.ValidatorsMock.increasePendingRewards(underlyingValidator.address,{
            value: _100KCS,
        });

        // shares to redeem 
        const shares = ethers.constants.WeiPerEther;
        // assets (KCS) can be redeemed 
        const KCSAmount = await ctx.SKCS.convertToAssets(shares);

        let expectedID = (await ctx.SKCS.redemptionRequestBox())[2];
        await expect(
            ctx.SKCS.connect(user1).requestRedemption(shares, user1.address)
        ).emit(
            ctx.SKCS, "NewRequestRedemption"
        ).withArgs(
            user1.address, // owner
            user1.address, // receiver 
            expectedID, // id 
            shares, //  shares 
            KCSAmount // KCS Amount 
        );

        // get the redemption request 
        const { requester,
            amountKCS,
            amountSKCS,
            timestamp,
            partiallyRedeemedKCS,
            accAmountKCSBefore } = await ctx.SKCS.getRedemptionRequest(expectedID);
        
        expect(requester).eq(user1.address); 
        expect(amountKCS).eq(KCSAmount);
        expect(amountSKCS).eq(shares);
        expect(partiallyRedeemedKCS).eq(0);
        expect(accAmountKCSBefore).eq(0);

        // assert redemption box 
        const [
            redeemingID,
            withdrawingID,
            length,
            accAmountKCS
        ] = await ctx.SKCS.redemptionRequestBox();
        
        expect(redeemingID).eq(0);
        expect(withdrawingID).eq(0);
        expect(length).eq(1);
        expect(accAmountKCS).eq(KCSAmount);

        // assert withdrawable amount 
        const withdrawable = await ctx.SKCS.connect(user1).withdrawable(user1.address);
        expect(withdrawable.assets).eq(0);
        expect(withdrawable.shares).eq(0);

        // notWithdrawable amount
        let notWithdrawable = await ctx.SKCS.connect(user1).notWithdrawable(user1.address);
        expect(notWithdrawable.assets).eq(KCSAmount);
        expect(notWithdrawable.shares).eq(shares);   

    });

 
    it("user1 requests the redemption of his own 1 sKCS (with profits)", async function () {

        // fake some profits
        await ctx.ValidatorsMock.increasePendingRewards(underlyingValidator.address,{
            value: _100KCS,
        });

        // shares to redeem 
        const shares = ethers.constants.WeiPerEther;
        // assets (KCS) can be redeemed 
        const KCSAmount = await ctx.SKCS.convertToAssets(shares);

        let expectedID = (await ctx.SKCS.redemptionRequestBox())[2];
        await expect(
            ctx.SKCS.connect(user1).requestRedemption(shares, user1.address)
        ).emit(
            ctx.SKCS, "NewRequestRedemption"
        ).withArgs(
            user1.address, // owner
            user1.address, // receiver 
            expectedID, // id 
            shares, //  shares 
            KCSAmount // KCS Amount 
        );

        // get the redemption request 
        const { requester,
            amountKCS,
            amountSKCS,
            timestamp,
            partiallyRedeemedKCS,
            accAmountKCSBefore } = await ctx.SKCS.getRedemptionRequest(expectedID);
        
        expect(requester).eq(user1.address); 
        expect(amountKCS).eq(KCSAmount);
        expect(amountSKCS).eq(shares);
        expect(partiallyRedeemedKCS).eq(0);
        expect(accAmountKCSBefore).eq(0);

        // assert redemption box 
        const [
            redeemingID,
            withdrawingID,
            length,
            accAmountKCS
        ] = await ctx.SKCS.redemptionRequestBox();
        
        expect(redeemingID).eq(0);
        expect(withdrawingID).eq(0);
        expect(length).eq(1);
        expect(accAmountKCS).eq(KCSAmount);

        // assert withdrawable amount 
        const withdrawable = await ctx.SKCS.connect(user1).withdrawable(user1.address);
        expect(withdrawable.assets).eq(0);
        expect(withdrawable.shares).eq(0);

        // notWithdrawable amount
        let notWithdrawable = await ctx.SKCS.connect(user1).notWithdrawable(user1.address);
        expect(notWithdrawable.assets).eq(KCSAmount);
        expect(notWithdrawable.shares).eq(shares);   

    });
    
    it("Redemption Request Limits", async function () {

        const sKCS = ctx.SKCS.connect(user1);

        const {maximumPendingRedemptionRequestPerUser} = await sKCS.protocolParams();

        // request redemption: 0.01 sKCS each time 
        const sKCSAmount = ethers.utils.parseUnits("0.01","ether");

        for(let i = 0; i< maximumPendingRedemptionRequestPerUser.toNumber(); ++i){
            await sKCS.requestRedemption(sKCSAmount,user1.address);
        }

        await expect(
            sKCS.requestRedemption(sKCSAmount,user1.address)
        ).to.revertedWith("Redemption: too many pending");


    });
    
        

});
