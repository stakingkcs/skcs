/* tslint:disable */
/* eslint-disable */

import {assert, expect} from "chai";
import { ethers } from "hardhat";
import { CreateContext } from "./context";

describe("set xxx", function () {
    it('set protocol fee', async function () {
        const context = await CreateContext();
        const [user] = context.users;

        // only owner
        expect(context.SKCS.connect(user).setProtocolFee(2000)).to.be.reverted;

        const feeRate = 2000;
        expect((await context.SKCS.protocolParams()).protocolFee).not.equal(feeRate);
        await context.SKCS.connect(context.admin).setProtocolFee(feeRate)
        expect((await context.SKCS.protocolParams()).protocolFee).to.be.equal(feeRate);
    });


})