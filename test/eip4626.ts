/* tslint:disable */
/* eslint-disable */

import {assert, expect} from "chai";
import { ethers } from "hardhat";
import { CreateContext } from "./context";

describe("EIP4626 function set", function () {
    it('asset', async function () {
        const context = await CreateContext();

        expect(await context.SKCS.asset()).to.be.equal(context.WKCS.address);
    });

    it('totalAssets', async function () {
        const context = await CreateContext();

        expect(await context.SKCS.totalAssets()).to.be.equal(0);
    });

    it('mint', async function () {
        const context = await CreateContext();
        const [user1, user2,] = context.users;
        const assets = ethers.constants.WeiPerEther;
        const shares = ethers.constants.WeiPerEther;

        await context.WKCS.connect(user1).deposit({value: assets});
        // console.log(await context.WKCS.balanceOf(user1.address));
        await context.WKCS.connect(user1).approve(context.SKCS.address, assets);
        // await context.SKCS.connect(user1).deposit(assets, user1.address);
        await context.SKCS.connect(user1).mint(shares, user1.address);

        // console.log("balance: ", (await context.SKCS.balanceOf(user1.address)));
        assert((await context.SKCS.balanceOf(user1.address)).eq(shares), "not equal");
        expect(await context.SKCS.balanceOf(user1.address), "The sKCS balance of user1 should be 1 ether").to.equal(shares);
    });

    it('deposit', async function () {

        const context = await CreateContext();
        const [user1, user2,] = context.users;
        const assets = ethers.constants.WeiPerEther;

        await context.WKCS.connect(user1).deposit({value: assets});
        // console.log(await context.WKCS.balanceOf(user1.address));
        await context.WKCS.connect(user1).approve(context.SKCS.address, assets);
        await context.SKCS.connect(user1).deposit(assets, user1.address);

        // console.log("balance: ", (await context.SKCS.balanceOf(user1.address)));
        assert((await context.SKCS.balanceOf(user1.address)).eq(assets), "not equal");
        expect(await context.SKCS.balanceOf(user1.address), "The sKCS balance of user1 should be 1 ether").to.equal(assets);

    });

    it('withdraw', async function () {
        const context = await CreateContext(1);
        const [user1, user2,] = context.users;
        const assets = ethers.constants.WeiPerEther;
        const shares = assets;

        expect(context.SKCS.connect(user1).withdraw(assets, user1.address, user1.address)).to.be.reverted;

        await context.SKCS.connect(user1).depositKCS(user1.address, {value: assets});
        // console.log("user1 sKCS: ", await context.SKCS.balanceOf(user1.address));

        await context.SKCS.connect(user1).requestRedemption(shares, user1.address);

        // console.log("user1 sKCS: ", await context.SKCS.balanceOf(user1.address));


        await context.mineBlocks(3);

        await context.SKCS.processRedemptionRequests();

        let [a, s] = await context.SKCS.connect(user1).withdrawable(user1.address);
        expect(a).eq(0);
        expect(s).eq(0);


        ([a, s] = await context.SKCS.connect(user1).notWithdrawable(user1.address));
        expect(a).eq(assets);
        expect(s).eq(shares);


        const blocks = 24 * 60 * 60 * 3 / 3 + 1;

        await context.mineBlocks(blocks);

        await context.SKCS.processRedemptionRequests();


        [a, s] = await context.SKCS.connect(user1).withdrawable(user1.address);
        expect(a).eq(assets);
        expect(s).eq(shares);

        ([a, s] = await context.SKCS.connect(user1).notWithdrawable(user1.address));
        expect(a).eq(0);
        expect(s).eq(0);

        const before = await context.WKCS.balanceOf(user1.address);
        await context.SKCS.connect(user1).withdraw(assets, user1.address, user1.address, {gasPrice: 0});

        const after = await context.WKCS.balanceOf(user1.address);
        expect(after.sub(before)).to.be.equal(shares);

    });

    it('redeem', async function () {

         // Create a context with a single validator
         const ctx = await CreateContext(1);
         const [user1, user2] =  ctx.users;
    
         // msg.sender is user1 
         let sKCS = ctx.SKCS.connect(user1);
    
    
         const _100E = ethers.utils.parseUnits("100","ether");
         const _50E = ethers.utils.parseUnits("50","ether");
    
         // user1 deposit 100 KCS 
         await sKCS.depositKCS(user1.address,{
             value: _100E,
         });
    
         expect(
             await sKCS.balanceOf(user1.address)
         ).eq(
             _100E
         );


         // redeeming without requestRedemption does not work 
         await expect(
             sKCS.redeem(_50E,user1.address,user1.address)
         ).revertedWith(
             "shares amount does not match with amount in redemption requests"
         );


         // user1 approve user2 100sKCS 
         await sKCS.approve(user2.address,_100E);

         // then, msg.sender becomes user2 
         sKCS = sKCS.connect(user2);

         // request redemption from user2
         await sKCS.requestRedemption(_100E,user1.address);

         // process redemption 
         await sKCS.processRedemptionRequests();

        let {assets:withrawableKCS} = await sKCS.withdrawable(user1.address);
        expect(withrawableKCS).eq(0);

        // wait for 3 days 
        await ctx.mineBlocks(3*24*60*60/3 + 1); 

         // process redemption again (i.e withdraw from KCC Staking)
         await sKCS.processRedemptionRequests();  
         
        ({assets:withrawableKCS} = await sKCS.withdrawable(user1.address));
        expect(withrawableKCS).eq(_100E);

        // BTW: As the redemption was requested by user2, user1
        //     cannot withdraw the redeemed KCS. 
        ({assets:withrawableKCS} = await sKCS.connect(user1).withdrawable(user1.address));
        expect(withrawableKCS).eq(0);

    });

    it('convertToShares', async function () {
        const context = await CreateContext();
        const assets = ethers.constants.WeiPerEther;

        expect(await context.SKCS.convertToShares(assets)).to.be.equal(assets);
    });

    it('convertToAssets', async function () {
        const context = await CreateContext();
        const shares = ethers.constants.WeiPerEther;

        expect(await context.SKCS.convertToAssets(shares)).to.be.equal(shares);
    });

    it('maxDeposit', async function () {
        const context = await CreateContext();
        const [user] = context.users;
        expect(await context.SKCS.maxDeposit(user.address)).to.be.equal(ethers.constants.MaxUint256);
    });

    it('maxMint', async function () {
        const context = await CreateContext();
        const [user] = context.users;
        expect(await context.SKCS.maxMint(user.address)).to.be.equal(ethers.constants.MaxUint256);
    });

    it('previewDeposit', async function () {
        const context = await CreateContext();
        const assets = ethers.constants.WeiPerEther;

        expect(await context.SKCS.previewDeposit(assets)).to.be.equal(assets);
    });

    it('previewMint', async function () {
        const context = await CreateContext();
        const shares = ethers.constants.WeiPerEther;

        expect(await context.SKCS.previewMint(shares)).to.be.equal(shares);
    });

    it('maxWithdraw', async function () {
        const context = await CreateContext();
        const [user1, user2] = context.users;
        const assets = ethers.constants.WeiPerEther;

        await context.WKCS.connect(user1).deposit({value: assets});
        // console.log(await context.WKCS.balanceOf(user1.address));
        await context.WKCS.connect(user1).approve(context.SKCS.address, assets);
        await context.SKCS.connect(user1).deposit(assets, user1.address);

        // console.log("balance: ", (await context.SKCS.balanceOf(user1.address)));
        assert((await context.SKCS.balanceOf(user1.address)).eq(assets), "not equal");
        expect(await context.SKCS.balanceOf(user1.address), "The sKCS balance of user1 should be 1 ether").to.equal(assets);

        expect(await context.SKCS.connect(user1).maxWithdraw(user1.address)).to.be.equal(assets);

        await context.SKCS.connect(user1).approve(user2.address, assets.mul(10000));
        expect(await context.SKCS.connect(user2).maxWithdraw(user1.address)).to.be.equal(assets);

    });

    it('previewWithdraw', async function () {
        const context = await CreateContext();
        const assets = ethers.constants.WeiPerEther;

        expect(await context.SKCS.previewWithdraw(assets)).to.be.equal(assets);
    });

    it('maxRedeem', async function () {
        const context = await CreateContext();
        const [user1, user2,] = context.users;
        const assets = ethers.constants.WeiPerEther;
        const shares = ethers.constants.WeiPerEther;

        await context.WKCS.connect(user1).deposit({value: assets});
        // console.log(await context.WKCS.balanceOf(user1.address));
        await context.WKCS.connect(user1).approve(context.SKCS.address, assets);
        await context.SKCS.connect(user1).deposit(assets, user1.address);

        // console.log("balance: ", (await context.SKCS.balanceOf(user1.address)));
        assert((await context.SKCS.balanceOf(user1.address)).eq(assets), "not equal");
        expect(await context.SKCS.balanceOf(user1.address), "The sKCS balance of user1 should be 1 ether").to.equal(assets);

        expect((await context.SKCS.connect(user1).maxRedeem(user1.address))).to.be.equal(shares);

        await context.SKCS.connect(user1).approve(user2.address, assets.mul(10000))

        expect(await context.SKCS.connect(user2).maxRedeem(user1.address)).to.be.equal(assets);
    });

    it('previewRedeem', async function () {
        const context = await CreateContext();
        const shares = ethers.constants.WeiPerEther;
        expect(await context.SKCS.previewRedeem(shares)).to.be.equal(shares);
    });

})