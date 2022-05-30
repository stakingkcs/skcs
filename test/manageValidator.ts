/* tslint:disable */
/* eslint-disable */

import {assert, expect} from "chai";
import { CreateContext } from "./context";
import {BigNumber} from "ethers";
import {ethers} from "hardhat";

describe("manage validators", function () {
    it('add 3 validators', async function () {
        const context = await CreateContext();
        const [validator1, validator2, validator3] = context.users;

        await expect((await context.SKCS.getActiveValidators()).length).to.equal(0);

        //console.log(`validators length: ${(await context.SKCS.getActiveValidators()).length}`)

        await context.SKCS.connect(context.admin).addUnderlyingValidator(validator1.address, 1);
        const v1 = await context.SKCS.getValidatorInfo(validator1.address);
        await expect(v1.val).to.be.equal(validator1.address);
        await expect(v1.weight).to.be.equal(1);

        //console.log(`after added 1 validators length: ${(await context.SKCS.getActiveValidators()).length}`)

        await context.SKCS.connect(context.admin).addUnderlyingValidator(validator2.address, 10);
        const v2 = await context.SKCS.getValidatorInfo(validator2.address);
        await expect(v2.val).to.be.equal(validator2.address);
        await expect(v2.weight).to.be.equal(10);

        //console.log(`after added 2 validators length: ${(await context.SKCS.getActiveValidators()).length}`)

        await expect(context.SKCS.connect(context.admin).addUnderlyingValidator(validator3.address, 1100)).to.be.reverted;

        //console.log(`validators length: ${(await context.SKCS.getActiveValidators()).length}`)
        await expect((await context.SKCS.getActiveValidators()).length).to.equal(2);

    });

    it('update weight of validator', async function () {
        const context = await CreateContext();
        const [validator1] = context.users;

        let beforeWeight: BigNumber;
        beforeWeight = (await context.SKCS.protocolParams()).sumOfWeight;
        let w1: BigNumber;
        w1 = BigNumber.from(1);
        await context.SKCS.connect(context.admin).addUnderlyingValidator(validator1.address, w1);
        const info1 = await context.SKCS.connect(context.admin).getValidatorInfo(validator1.address);

        await assert( (await context.SKCS.protocolParams()).sumOfWeight.eq(beforeWeight.add(w1)), "not equal");
        await expect(info1.weight, "").to.be.equal(w1);
        const w2 = 1;
        await context.SKCS.connect(context.admin).updateWeightOfValidator(validator1.address, w2);

        await assert( (await context.SKCS.protocolParams()).sumOfWeight.eq(beforeWeight.add(w2)), "not equal");

        const info2 = await context.SKCS.connect(context.admin).getValidatorInfo(validator1.address);

        expect(info2.weight, "").to.be.equal(w2);
    });

    it('disable a validator', async function () {
        const context = await CreateContext();
        const [validator1, validator2] = context.users;

        const w1 = 1;
        await context.SKCS.connect(context.admin).addUnderlyingValidator(validator1.address, w1);
        await expect((await context.SKCS.getActiveValidators()).length).to.equal(1);

        const beforeWeight = (await context.SKCS.protocolParams()).sumOfWeight;
        // failed to disable underlying validator when only one in the pool
        await expect(context.SKCS.connect(context.admin).disableUnderlyingValidator(validator1.address)).to.be.reverted;

        const w2 = 10;
        await context.SKCS.connect(context.admin).addUnderlyingValidator(validator2.address, w2);

        await context.SKCS.connect(context.admin).disableUnderlyingValidator(validator1.address)

        await assert((await context.SKCS.protocolParams()).sumOfWeight.eq(beforeWeight.add(w2)), "not equal");
        assert(!(await context.SKCS.isActiveValidator(validator1.address)), "not contain");
        assert((await context.SKCS.isActiveValidator(validator2.address)), "not contain");

        // update sum of weight of all validators
        await context.SKCS.compound();
        await assert((await context.SKCS.protocolParams()).sumOfWeight.eq(w2), "not equal");
        assert(!(await context.SKCS.isActiveValidator(validator1.address)), "not contain");
        assert((await context.SKCS.isActiveValidator(validator2.address)), "not contain");

    });

    it('disable multi validators', async function () {
        const context = await CreateContext();
        const [user, validator1, validator2, validator3] = context.users;

        await context.SKCS.connect(context.admin).addUnderlyingValidator(validator1.address, 1);
        await context.SKCS.connect(context.admin).addUnderlyingValidator(validator2.address, 1);
        await context.SKCS.connect(context.admin).addUnderlyingValidator(validator3.address, 1);

        const beforeWeight = (await context.SKCS.protocolParams()).sumOfWeight;

        // the first staking to the first validator
        const stakedAmount = ethers.constants.WeiPerEther;
        await context.SKCS.connect(user).depositKCS(user.address, {value: stakedAmount});
        await context.SKCS.connect(user).depositKCS(user.address, {value: stakedAmount});
        await context.SKCS.connect(user).depositKCS(user.address, {value: stakedAmount});

        await expect((await context.SKCS.getActiveValidators()).length, "check validators").to.equal(3);

        // disable validator1
        await context.SKCS.connect(context.admin).disableUnderlyingValidator(validator1.address);
        assert(!(await context.SKCS.isActiveValidator(validator1.address)), "not contain");
        assert((await context.SKCS.isActiveValidator(validator2.address)), "not contain");
        assert((await context.SKCS.isActiveValidator(validator3.address)), "not contain");

        await assert((await context.SKCS.protocolParams()).sumOfWeight.eq(beforeWeight), "not equal");

        // disable validator2
        await context.SKCS.connect(context.admin).disableUnderlyingValidator(validator2.address);
        assert(!(await context.SKCS.isActiveValidator(validator1.address)), "not contain");
        assert(!(await context.SKCS.isActiveValidator(validator2.address)), "not contain");
        assert((await context.SKCS.isActiveValidator(validator3.address)), "not contain");

        await assert((await context.SKCS.protocolParams()).sumOfWeight.eq(beforeWeight), "not equal");

        // update sum of weight of all validators
        await context.SKCS.compound();
        await assert((await context.SKCS.protocolParams()).sumOfWeight.eq(beforeWeight.sub(2)), "not equal");

        await assert(!(await context.SKCS.isActiveValidator(validator1.address)), "not contain");
        await assert(!(await context.SKCS.isActiveValidator(validator2.address)), "not contain");
        await assert((await context.SKCS.isActiveValidator(validator3.address)), "not contain");

        // check validators
        expect((await context.SKCS.getActiveValidators()).length, "check validators").to.equal(1);
    });
})