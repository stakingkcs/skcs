import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { CreateContext } from "./context";


// ensure the state of the box 

describe("The state of the Redemption Request Box", function () {

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

    it("Request a series of redemptions",async ()=>{

        const sKCS = ctx.SKCS.connect(user1);

        const sKCSAmount = ethers.utils.parseEther("0.01");
        const KCSAmount = await sKCS.convertToAssets(sKCSAmount);

        // the initial state of the box 
        let [
            redeemingID,
            withdrawingID,
            length,
            accAmountKCS,
        ] = await sKCS.redemptionRequestBox(); 

        expect([
            BigNumber.from(redeemingID),
            BigNumber.from(withdrawingID),
            BigNumber.from(length),
            BigNumber.from(accAmountKCS),
        ]).deep.eq([
            BigNumber.from(0),
            BigNumber.from(0),
            BigNumber.from(0),
            BigNumber.from(0)
        ]);



        for(let i =0; i < 30; ++i){
            
            await sKCS.requestRedemption(sKCSAmount,user1.address);
            
            (
                [
                    redeemingID,
                    withdrawingID,
                    length,
                    accAmountKCS,
                ] = await sKCS.redemptionRequestBox()
            );

            expect([
                BigNumber.from(redeemingID),
                BigNumber.from(withdrawingID),
                BigNumber.from(length),
                BigNumber.from(accAmountKCS),
            ]).deep.eq([
                BigNumber.from(0), // redeemingID always 0 
                BigNumber.from(0), // withdrawingID always 0 
                BigNumber.from(i+1),
                BigNumber.from(KCSAmount.mul(i+1))
            ]);            

        }


        // inspect each redemption request 
        for(let i=0; i < 30; ++i){
            const {
                requester,
                amountSKCS,
                amountKCS,
                partiallyRedeemedKCS,
                accAmountKCSBefore,
            }= await sKCS.getRedemptionRequest(i);

            expect([
                requester,
                BigNumber.from(amountSKCS),
                BigNumber.from(amountKCS),
                BigNumber.from(partiallyRedeemedKCS),
                BigNumber.from(accAmountKCSBefore),
            ]).deep.eq([
                user1.address, 
                BigNumber.from(sKCSAmount), 
                BigNumber.from(KCSAmount),
                BigNumber.from(0),
                BigNumber.from(KCSAmount.mul(i)), // accumulated KCS amount before this request 
            ]);  

        }


        // process redemptions 
        await sKCS.processRedemptionRequests();

        (
            [
                redeemingID,
                withdrawingID,
                length,
                accAmountKCS,
            ] = await sKCS.redemptionRequestBox()
        );   
        
        expect([
            BigNumber.from(redeemingID),
            BigNumber.from(withdrawingID),
            BigNumber.from(length),
            BigNumber.from(accAmountKCS),
        ]).deep.eq([
            BigNumber.from(30), // redeemingID always 0 
            BigNumber.from(0), // withdrawingID always 0 
            BigNumber.from(30),
            BigNumber.from(KCSAmount.mul(30))
        ]);             


    });

    

  

});


