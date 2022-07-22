import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect, use } from "chai";
import { ethers } from "hardhat";
import { CreateContext } from "./context";
import { BigNumber } from "ethers";


describe("Process Redemption Requests (Multiple Validators)", function () {

    // context for testing 
    let ctx: Awaited<ReturnType<typeof CreateContext>>;
    // user1 and user2 for testing 
    let user1: SignerWithAddress, user2: SignerWithAddress, user3: SignerWithAddress;
    // 100 KCS 
    const _100E = ethers.utils.parseUnits("100", "ether");
    const _40E = ethers.utils.parseUnits("40", "ether");
    const _110E = ethers.utils.parseUnits("110", "ether");
    const _90E = ethers.utils.parseUnits("90", "ether");
    const _80E = ethers.utils.parseUnits("80", "ether");
    const _10E = ethers.utils.parseUnits("10","ether");
    const _140E = ethers.utils.parseUnits("140","ether");
    const _77E = ethers.utils.parseUnits("77","ether");
    const _50E = ethers.utils.parseUnits("50","ether");
    const _127E = ethers.utils.parseUnits("127","ether");
    const _210E = ethers.utils.parseUnits("210","ether");
    const _120E = ethers.utils.parseUnits("120","ether");
    // 0 
    const zero = ethers.constants.Zero;
    // the underlying validators
    let val1: SignerWithAddress, val2: SignerWithAddress, val3: SignerWithAddress;

    this.beforeEach(async () => {
        // create context with 3 validators 
        ctx = await CreateContext(3);
        [user1, user2, user3] = ctx.users;
        [val1, val2, val3] = ctx.validators

        // user1, user2 and user3 each deposits 100 KCS 
        await ctx.SKCS.connect(user1).depositKCS(user1.address, {
            value: _100E,
        });
        await ctx.SKCS.connect(user2).depositKCS(user2.address, {
            value: _100E,
        });
        await ctx.SKCS.connect(user3).depositKCS(user3.address, {
            value: _100E,
        });

        expect(await ctx.SKCS.balanceOf(user1.address)).eq(_100E);
        expect(await ctx.SKCS.balanceOf(user2.address)).eq(_100E);
        expect(await ctx.SKCS.balanceOf(user3.address)).eq(_100E);

        // each validator with 100 votes 
        let {votes,
            revoking,
            pendingRewards} = await ctx.ValidatorsMock.validatorsVotes(val1.address);
        expect(votes).eq(100);

        ({votes,
          revoking,
          pendingRewards} = await ctx.ValidatorsMock.validatorsVotes(val2.address));
        expect(votes).eq(100);

        ({votes,
            revoking,
            pendingRewards} = await ctx.ValidatorsMock.validatorsVotes(val3.address));
          expect(votes).eq(100);
    });


    it("limit the interval between redeeming from KCC staking",async()=>{

        // msg.sender is user1
        const sKCS = ctx.SKCS.connect(user1);

        // Request for redeeming 10 sKCS
        await expect(
            sKCS.requestRedemption(_10E,user1.address)
        ).emit(
            sKCS,
            "NewRequestRedemption"
        ).withArgs(
            user1.address, // owner 
            user1.address, // msg.sender
            0, // id 
            _10E, // shares
            _10E, // amount KCS 
        )

        // Process the redemption Request 
        await expect(
            sKCS.processRedemptionRequests()
        ).emit(
            sKCS,
            "RedeemFromBufferAndKCCStaking"
        ).withArgs(
            0, // preRedeemingID
            1, // new redeemingID 
            await ethers.provider.getBlockNumber() + 1, // block number (hardhat auto-mine mode hack)
            _10E,
        )

        // Request for redeeming another 10 sKCS
        await sKCS.requestRedemption(_10E,user1.address);
        await expect(
            sKCS.processRedemptionRequests(),
            "The interval between redeeming from KCC staking is 1day"
        ).revertedWith(
            "KCC Staking Interval"
        );


        // wait for 1 day
        await ctx.mineBlocks(24*60*60/3 + 1); 
        
        // process redemption request
        // This should not complain
        await expect(
            sKCS.processRedemptionRequests()
        ).emit(
            sKCS,
            "RedeemFromBufferAndKCCStaking"
        ).withArgs(
            1, // preRedeemingID
            2, // new redeemingID 
            await ethers.provider.getBlockNumber() + 1, // block number (hardhat auto-mine mode hack)
            _10E,
        )

    });


    it("When all the requests cannot be processed with a single validators",async()=>{

        // user2 and user3 both transfer their sKCS to user1
        await ctx.SKCS.connect(user2).transfer(user1.address,_100E);
        await ctx.SKCS.connect(user3).transfer(user1.address,_100E);

        // msg.sender is user1
        const sKCS = ctx.SKCS.connect(user1);
        
        expect(
            await sKCS.balanceOf(user1.address),
            "all sKCS has been transferred to user1"
        ).eq(
            _100E.mul(3)
        );


        // Make 3 requests for redeeming: 
        //  1.  10 sKCS 
        //  2.  40 sKCS 
        //  3.  90 sKCS 
        //            = 140 sKCS 
        // 

        
        // Redeem 10 sKCS 
        await expect(
            sKCS.requestRedemption(_10E,user1.address)
        ).emit(
            sKCS,
            "NewRequestRedemption"
        ).withArgs(
            user1.address, // owner 
            user1.address, // msg.sender
            0, // id 
            _10E, // shares
            _10E, // amount KCS 
        )

        // Redeem 40 sKCS 
        await expect(
            sKCS.requestRedemption(_40E,user1.address)
        ).emit(
            sKCS,
            "NewRequestRedemption"
        ).withArgs(
            user1.address, // owner 
            user1.address, // msg.sender
            1, // id 
            _40E, // shares
            _40E, // amount KCS 
        )


        // Redeem 90 sKCS 
        await expect(
            sKCS.requestRedemption(_90E,user1.address)
        ).emit(
            sKCS,
            "NewRequestRedemption"
        ).withArgs(
            user1.address, // owner 
            user1.address, // msg.sender
            2, // id 
            _90E, // shares
            _90E, // amount KCS 
        )


        // Each validator has 100 KCS staked 
        // And, we add 10 KCS as pendingRewards to each validator 
        await ctx.ValidatorsMock.increasePendingRewards(val1.address,{
            value: _10E
        });
        await ctx.ValidatorsMock.increasePendingRewards(val2.address,{
            value: _10E
        });
        await ctx.ValidatorsMock.increasePendingRewards(val3.address,{
            value: _10E
        });


        // Let's process redemption 
        // 
        // Total pending: 140 KCS 
        //   - Redeem from pending Rewards: 27KCS  (30 KCS pendingRewards excluding fee)
        //   - Redeem from KCC Staking: 100 KCS 
        // 
        // The last request is partially redeemed 

        await expect(
            sKCS.processRedemptionRequests()
        ).emit(
            sKCS,
            "RedeemFromBufferAndKCCStaking"
        ).withArgs(
            0, // preRedeemingID
            2, // new redeemingID, the request with id==2 is partially redeemed
            await ethers.provider.getBlockNumber() + 1, // block number (hardhat auto-mine mode hack)
            _127E, // 100KCS from KCC Staking + 10 KCS pendingRewards
        );   
        

        // inspect box state
        let [
            redeemingID,
            withdrawingID,
            length,
            accAmountKCS,
        ] = await sKCS.redemptionRequestBox()

        expect([
            BigNumber.from(redeemingID),
            BigNumber.from(withdrawingID),
            BigNumber.from(length),
            BigNumber.from(accAmountKCS),
        ]).deep.eq([
            BigNumber.from(2),
            BigNumber.from(0),
            BigNumber.from(3),
            BigNumber.from(_90E.add(_10E).add(_40E))
        ]);

        // inspect the partially redeemed request 
        let {
            requester,
            amountSKCS,
            amountKCS,
            partiallyRedeemedKCS,
            accAmountKCSBefore
        } = await sKCS.getRedemptionRequest(2);

        expect(requester).eq(user1.address);
        expect(amountSKCS).eq(_90E);
        expect(amountKCS).eq(_90E);
        expect(partiallyRedeemedKCS).eq(_77E); // 127E - 10 - 40 = 77E
        expect(accAmountKCSBefore).eq(_50E);


        // wait for 1 day
        await ctx.mineBlocks(24*60*60/3 + 1); 
        
        // process redemption request again
        await expect(
            sKCS.processRedemptionRequests()
        ).emit(
            sKCS,
            "RedeemFromBufferAndKCCStaking"
        ).withArgs(
            2, // preRedeemingID
            3, // new redeemingID 
            await ethers.provider.getBlockNumber() + 1, // block number (hardhat auto-mine mode hack)
            _90E.sub(_77E),
        );


        // inspect box state
        ([
            redeemingID,
            withdrawingID,
            length,
            accAmountKCS,
        ] = await sKCS.redemptionRequestBox());
        expect([
            BigNumber.from(redeemingID),
            BigNumber.from(withdrawingID),
            BigNumber.from(length),
            BigNumber.from(accAmountKCS),
        ]).deep.eq([
            BigNumber.from(3),
            BigNumber.from(2),
            BigNumber.from(3),
            BigNumber.from(_90E.add(_10E).add(_40E))
        ]);


        // withdrawable check 
        let {assets} = await sKCS.withdrawable(user1.address);
        expect(
            assets
        ).eq(
            _50E // 10 + 40 (from the first 2 redemption requests)
        )


        // wait for another day 
        await ctx.mineBlocks(24*60*60/3 + 1); 

        await sKCS.processRedemptionRequests();

        ({assets} = await sKCS.withdrawable(user1.address));
        expect(
            assets
        ).eq(
            _140E, // 
        )        

    });


    
    it("#7 Broken binary search",async()=>{

        // user2 and user3 both transfer their sKCS to user1
        await ctx.SKCS.connect(user2).transfer(user1.address,_100E);
        await ctx.SKCS.connect(user3).transfer(user1.address,_100E);

        // msg.sender is user1
        const sKCS = ctx.SKCS.connect(user1);
        
        expect(
            await sKCS.balanceOf(user1.address),
            "all sKCS has been transferred to user1"
        ).eq(
            _100E.mul(3)
        );


        // Make 3 requests for redeeming: 
        //  1.  10 sKCS 
        //  2.  110 sKCS 
        //  3.  90 sKCS 
        //            = 210 sKCS 
        // 

        
        // Redeem 10 sKCS 
        await expect(
            sKCS.requestRedemption(_10E,user1.address)
        ).emit(
            sKCS,
            "NewRequestRedemption"
        ).withArgs(
            user1.address, // owner 
            user1.address, // msg.sender
            0, // id 
            _10E, // shares
            _10E, // amount KCS 
        )

        // Redeem 110 sKCS 
        await expect(
            sKCS.requestRedemption(_110E,user1.address)
        ).emit(
            sKCS,
            "NewRequestRedemption"
        ).withArgs(
            user1.address, // owner 
            user1.address, // msg.sender
            1, // id 
            _110E, // shares
            _110E, // amount KCS 
        )


        // Redeem 90 sKCS 
        await expect(
            sKCS.requestRedemption(_90E,user1.address)
        ).emit(
            sKCS,
            "NewRequestRedemption"
        ).withArgs(
            user1.address, // owner 
            user1.address, // msg.sender
            2, // id 
            _90E, // shares
            _90E, // amount KCS 
        )

        await expect(
            sKCS.processRedemptionRequests()
        ).emit(
            sKCS,
            "RedeemFromBufferAndKCCStaking"
        ).withArgs(
            0, // preRedeemingID
            1, // new redeemingID, the request with id==1 is partially redeemed
            await ethers.provider.getBlockNumber() + 1, // block number (hardhat auto-mine mode hack)
            _100E, // 
        );   
        

        // inspect box state
        let [
            redeemingID,
            withdrawingID,
            length,
            accAmountKCS,
        ] = await sKCS.redemptionRequestBox()

        expect([
            BigNumber.from(redeemingID),
            BigNumber.from(withdrawingID),
            BigNumber.from(length),
            BigNumber.from(accAmountKCS),
        ]).deep.eq([
            BigNumber.from(1),
            BigNumber.from(0),
            BigNumber.from(3),
            BigNumber.from(_210E)
        ]);


        // inspect the partially redeemed request 
        let {
            requester,
            amountSKCS,
            amountKCS,
            partiallyRedeemedKCS,
            accAmountKCSBefore
        } = await sKCS.getRedemptionRequest(1);

        expect(requester).eq(user1.address);
        expect(amountSKCS).eq(_110E);
        expect(amountKCS).eq(_110E);
        expect(partiallyRedeemedKCS).eq(_90E); // (100 - 10) = 90
        expect(accAmountKCSBefore).eq(_10E);

        // wait for 1 day
        await ctx.mineBlocks(24*60*60/3 + 1); 

        await expect(
            sKCS.processRedemptionRequests()
        ).emit(
            sKCS,
            "RedeemFromBufferAndKCCStaking"
        ).withArgs(
            1, // preRedeemingID
            2, // new redeemingID, the request with id==2 is partially redeemed
            await ethers.provider.getBlockNumber() + 1, // block number (hardhat auto-mine mode hack)
            _100E, // 
        );        
        
        
        // inspect box state
        [
            redeemingID,
            withdrawingID,
            length,
            accAmountKCS,
        ] = await sKCS.redemptionRequestBox()

        expect([
            BigNumber.from(redeemingID),
            BigNumber.from(length),
            BigNumber.from(accAmountKCS),
        ]).deep.eq([
            BigNumber.from(2),
            BigNumber.from(3),
            BigNumber.from(_210E)
        ]);        
 
        // inspect the partially redeemed request 
        ({
            requester,
            amountSKCS,
            amountKCS,
            partiallyRedeemedKCS,
            accAmountKCSBefore
        } = await sKCS.getRedemptionRequest(2));

        expect(requester).eq(user1.address);
        expect(amountSKCS).eq(_90E);
        expect(amountKCS).eq(_90E);
        expect(partiallyRedeemedKCS).eq(_80E); // 100 - 20 = 80
        expect(accAmountKCSBefore).eq(_120E);

    });



});
