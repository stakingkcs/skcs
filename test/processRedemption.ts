import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect, use } from "chai";
import { ethers, network } from "hardhat";
import { CreateContext } from "./context";

describe("Process Redemption Requests (Single Validator)", function () {

    // context for testing 
    let ctx: Awaited<ReturnType<typeof CreateContext>>;
    // user1 and user2 for testing 
    let user1: SignerWithAddress, user2: SignerWithAddress;
    // 100 KCS 
    const _100KCS = ethers.utils.parseUnits("100", "ether");
    // 0 
    const zero = ethers.constants.Zero;
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

        // 200 votes 
        const {votes,revoking,pendingRewards} = await ctx.ValidatorsMock.validatorsVotes(underlyingValidator.address);
        expect(votes).eq(200);
    })

    it("Process redemption requests from buffer only", async function () {

        // msg.sender is user1 
        const sKCS = ctx.SKCS.connect(user1);

        await sKCS.depositKCS(user1.address,{
            value: ethers.utils.parseUnits("0.1","ether")
        });

        expect(
            (await sKCS.kcsBalances()).buffer,
            "Now, we should have 0.1 KCS in the buffer."
        ).eq(
            ethers.utils.parseUnits("0.1","ether")
        )

        
        const sKCSToRedeem = ethers.utils.parseUnits("0.05","ether");
        const KCSReceived = await sKCS.convertToAssets(sKCSToRedeem);

        // And there are no pending rewards from KCC staking yet,
        // The sKCS:KCS rate should be 1:1
        expect(KCSReceived).eq(sKCSToRedeem);

        await expect(
            sKCS.requestRedemption(sKCSToRedeem,user1.address)
        ).emit(
            ctx.SKCS, "NewRequestRedemption"
        ).withArgs(
            user1.address, // owner
            user1.address, // receiver 
            0,
            sKCSToRedeem,
            KCSReceived
        );


        // process Redemption 
        await expect(
            sKCS.processRedemptionRequests(),
            "Process redemption requests with buffer only"
        ).emit(
            sKCS,"RedeemFromBufferOnly"
        ).withArgs(
            0, // preRedeemingID
            1, // newRedeemingID 
            await ethers.provider.getBlockNumber() + 1, // block number (hardhat auto-mine mode hack) 
            KCSReceived // amount 
        )


        let {assets,shares} = await sKCS.withdrawable(user1.address);
        expect(assets).eq(zero);
        expect(shares).eq(zero);

        ({assets,shares} = await sKCS.notWithdrawable(user1.address));
        expect(assets).eq(KCSReceived);
        expect(shares).eq(sKCSToRedeem);   
            
    


        // wait for 3 days 
        await ctx.mineBlocks(3*24*60*60/3 + 1);
      await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x0']);


      // call processRedemptionRequests Again
        await sKCS.processRedemptionRequests();

        ({assets,shares} = await sKCS.withdrawable(user1.address));
        expect(assets).eq(KCSReceived);
        expect(shares).eq(sKCSToRedeem);   

        ({assets,shares} = await sKCS.notWithdrawable(user1.address));
        expect(assets).eq(zero);
        expect(shares).eq(zero);   


        const preBalance = await user1.getBalance();

        // withdraw 
        await expect(
            sKCS.withdrawKCS(user1.address,user1.address,{
                gasPrice: 0, // only works if there is not base fee (i.e before London Fork)
            })
        ).emit(
            sKCS,"Withdraw"
        ).withArgs(
            user1.address,
            user1.address,
            user1.address,
            KCSReceived,
            sKCSToRedeem
        )

        const afterBalance = await user1.getBalance();

        // check if the correct amount of KCS is received 
        expect(afterBalance.sub(preBalance)).eq(KCSReceived);

        // Now, no withdrawable amounts 
        ({assets,shares} = await sKCS.withdrawable(user1.address));
        expect(assets).eq(0);
        expect(shares).eq(0);  
        
    });

    it("Process redemption requests from buffer and pendingRewards", async function () {

        // msg.sender is user1 
        const sKCS = ctx.SKCS.connect(user1);

        await sKCS.depositKCS(user1.address,{
            value: ethers.utils.parseUnits("0.1","ether")
        });

        expect(
            (await sKCS.kcsBalances()).buffer,
            "Now, we should have 0.1 KCS in the buffer."
        ).eq(
            ethers.utils.parseUnits("0.1","ether")
        )

        // only 0.1 in buffer... 
        // but we are going to redeem 0.2 sKCS 
        const sKCSToRedeem = ethers.utils.parseUnits("0.2","ether");
        const KCSReceived = await sKCS.convertToAssets(sKCSToRedeem);

        // And there are no pending rewards from KCC staking yet,
        // The sKCS:KCS rate should be 1:1
        expect(KCSReceived).eq(sKCSToRedeem);

        await expect(
            sKCS.requestRedemption(sKCSToRedeem,user1.address)
        ).emit(
            ctx.SKCS, "NewRequestRedemption"
        ).withArgs(
            user1.address, // owner
            user1.address, // receiver 
            0,
            sKCSToRedeem,
            KCSReceived
        );

        // After requesting for redemption and 
        // before processing the redemption requests
        // Let's add some pendingRewards (0.12 KCS) 
        // Note: we have 10% protocol fee.. 
        // Actually received by sKCS holders: 0.12 * 90% = 0.108 KCS 
        await ctx.ValidatorsMock.increasePendingRewards(underlyingValidator.address,{
            value: ethers.utils.parseUnits("0.12","ether")
        })

        // process Redemption 
        await expect(
            sKCS.processRedemptionRequests(),
            "Process redemption requests with buffer only"
        ).emit(
            sKCS,"RedeemFromBufferOnly"
        ).withArgs(
            0, // preRedeemingID
            1, // newRedeemingID 
            await ethers.provider.getBlockNumber() + 1, // block number (hardhat auto-mine mode hack) 
            KCSReceived // amount 
        )


        let {assets,shares} = await sKCS.withdrawable(user1.address);
        expect(assets).eq(zero);
        expect(shares).eq(zero);

        ({assets,shares} = await sKCS.notWithdrawable(user1.address));
        expect(assets).eq(KCSReceived);
        expect(shares).eq(sKCSToRedeem);   

        // wait for 3 days 
        await ctx.mineBlocks(3*24*60*60/3 + 1);
      await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x0']);


      // call processRedemptionRequests Again
        await sKCS.processRedemptionRequests();

        ({assets,shares} = await sKCS.withdrawable(user1.address));
        expect(assets).eq(KCSReceived);
        expect(shares).eq(sKCSToRedeem);   

        ({assets,shares} = await sKCS.notWithdrawable(user1.address));
        expect(assets).eq(zero);
        expect(shares).eq(zero);   


        const preBalance = await user1.getBalance();

        // withdraw 
        await expect(
            sKCS.withdrawKCS(user1.address,user1.address,{
                gasPrice: 0, // only works if there is not base fee (i.e before London Fork)
            })
        ).emit(
            sKCS,"Withdraw"
        ).withArgs(
            user1.address,
            user1.address,
            user1.address,
            KCSReceived,
            sKCSToRedeem
        )

        const afterBalance = await user1.getBalance();

        // check if the correct amount of KCS is received 
        expect(afterBalance.sub(preBalance)).eq(KCSReceived);

        // Now, no withdrawable amounts 
        ({assets,shares} = await sKCS.withdrawable(user1.address));
        expect(assets).eq(0);
        expect(shares).eq(0);  
        
    });

    it("Process redemption requests from buffer && KCC Staking", async function () {

        // msg.sender is user1 
        const sKCS = ctx.SKCS.connect(user1);

        await sKCS.depositKCS(user1.address,{
            value: ethers.utils.parseUnits("0.1","ether")
        });

        expect(
            (await sKCS.kcsBalances()).buffer,
            "Now, we should have 0.1 KCS in the buffer."
        ).eq(
            ethers.utils.parseUnits("0.1","ether")
        )

        // only 0.1 in buffer... 
        // but we are going to redeem 20 sKCS 
        const sKCSToRedeem = ethers.utils.parseUnits("20","ether");
        const KCSReceived = await sKCS.convertToAssets(sKCSToRedeem);

        // And there are no pending rewards from KCC staking yet,
        // The sKCS:KCS rate should be 1:1
        expect(KCSReceived).eq(sKCSToRedeem);

        await expect(
            sKCS.requestRedemption(sKCSToRedeem,user1.address)
        ).emit(
            ctx.SKCS, "NewRequestRedemption"
        ).withArgs(
            user1.address, // owner
            user1.address, // receiver 
            0,
            sKCSToRedeem,
            KCSReceived
        );

        // process Redemption 
        await expect(
            sKCS.processRedemptionRequests(),
            "Process redemption requests with buffer only"
        ).emit(
            sKCS,"RedeemFromBufferAndKCCStaking"
        ).withArgs(
            0, // preRedeemingID
            1, // newRedeemingID 
            await ethers.provider.getBlockNumber() + 1, // block number (hardhat auto-mine mode hack) 
            KCSReceived // amount 
        )


        let {assets,shares} = await sKCS.withdrawable(user1.address);
        expect(assets).eq(zero);
        expect(shares).eq(zero);

        ({assets,shares} = await sKCS.notWithdrawable(user1.address));
        expect(assets).eq(KCSReceived);
        expect(shares).eq(sKCSToRedeem);   

        // wait for 3 days 
        await ctx.mineBlocks(3*24*60*60/3 + 1);
      await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x0']);


      // call processRedemptionRequests Again
        await sKCS.processRedemptionRequests();

        ({assets,shares} = await sKCS.withdrawable(user1.address));
        expect(assets).eq(KCSReceived);
        expect(shares).eq(sKCSToRedeem);   

        ({assets,shares} = await sKCS.notWithdrawable(user1.address));
        expect(assets).eq(zero);
        expect(shares).eq(zero);   


        const preBalance = await user1.getBalance();

        // withdraw 
        await expect(
            sKCS.withdrawKCS(user1.address,user1.address,{
                gasPrice: 0, // only works if there is not base fee (i.e before London Fork)
            })
        ).emit(
            sKCS,"Withdraw"
        ).withArgs(
            user1.address,
            user1.address,
            user1.address,
            KCSReceived,
            sKCSToRedeem
        )

        const afterBalance = await user1.getBalance();

        // check if the correct amount of KCS is received 
        expect(afterBalance.sub(preBalance)).eq(KCSReceived);

        // Now, no withdrawable amounts 
        ({assets,shares} = await sKCS.withdrawable(user1.address));
        expect(assets).eq(0);
        expect(shares).eq(0);  
        
    });


    

});
