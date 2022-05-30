/* tslint:disable */
/* eslint-disable */
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers,network, upgrades} from "hardhat";
import { SKCS, ValidatorsMock, WKCS } from "../typechain";


// mine blocks
async function mineBlocks(count: number, interval? : number) {
    if(interval == null){
        interval = 3; // default interval : 3s
    }

    await network.provider.send("hardhat_mine", 
    [
        ethers.utils.hexValue(count),
        ethers.utils.hexValue(interval) //  the block interval is 3 seconds 
    ]);
    
} 



/**
 * 
 * @param nVal (optional) The number of validators 
 * @returns context 
 */
export async function CreateContext(nVal?:number){

    const [proxyDeployer, deployer, admin,...usersAndValidators]= await ethers.getSigners();

    const WKCS  = await (await ethers.getContractFactory("WKCS",deployer)).deploy() as WKCS;
    const ValidatorsMock = await (await ethers.getContractFactory("ValidatorsMock",deployer)).deploy() as ValidatorsMock;
    const ProcessRedemptionFacet = await (await ethers.getContractFactory("sKCSProcessRedemptionsFacet",deployer)).deploy();
    const protocolFee = 1000; 
    const minStakingKCSAmount = ethers.constants.WeiPerEther;
    const maximumPendingRedemptionRequestPerUser = 200;

    //const SKCS = await (await ethers.getContractFactory("sKCS",deployer)).deploy() as SKCS;


    const proxy = await upgrades.deployProxy(
        await ethers.getContractFactory("sKCS", proxyDeployer),
        [WKCS.address,
            ValidatorsMock.address,
            ProcessRedemptionFacet.address,
            protocolFee,
            minStakingKCSAmount,
            maximumPendingRedemptionRequestPerUser,
            admin.address]);
    await proxy.deployed();
    const SKCS = proxy as SKCS;

    // await SKCS.initialize(WKCS.address,
    //         ValidatorsMock.address,
    //         ProcessRedemptionFacet.address,
    //         protocolFee,
    //         minStakingKCSAmount,
    //         maximumPendingRedemptionRequestPerUser,
    //         admin.address);

    let users:SignerWithAddress[], validators:SignerWithAddress[];

    // Add validators 
    if (nVal != null){
        validators = usersAndValidators.slice(0,nVal);
        users      = usersAndValidators.slice(nVal);
    }else{
        users = usersAndValidators;
        validators = [];
    }

    // Add all validators 
    Promise.all(validators.map(async (v)=>{
        await SKCS.connect(admin).addUnderlyingValidator(v.address,100);
    }))

    return {
        deployer,
        admin,
        users,
        validators,
        SKCS,
        WKCS,
        ValidatorsMock,
        protocolFee,
        minStakingKCSAmount,
        maximumPendingRedemptionRequestPerUser,
        mineBlocks,
    }
}

