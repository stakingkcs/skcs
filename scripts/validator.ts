import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getSignerFromKeystore } from "./keystore";
import { SKCS__factory } from "../typechain";


export async function addUnderlyingValidator(hre:HardhatRuntimeEnvironment, validator:string, weight:bigint) {
  const SKCSAddress = "0xDF08Cb011FfB6Fe7fE86266112F41f77dcEB0C6f";
  const signer = await getSignerFromKeystore(hre);


  const skcs = await SKCS__factory.connect(SKCSAddress, signer);
  const activeValidator = await skcs.getActiveValidators();
  if (activeValidator.length > 0) {
    console.log(`before add validator, active validator: ${activeValidator}`);
  } else {
    console.log(`active validator not found!`);
  }

  const tx = await skcs.addUnderlyingValidator(validator, weight);
  await tx.wait(2);

  const after = await skcs.getActiveValidators();
  if (after.length > 0) {
    console.log(`after add validator, active validator: ${after}`);
  }
}