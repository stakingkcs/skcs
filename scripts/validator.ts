import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getSignerFromKeystore } from "./keystore";
import { SKCS__factory } from "../typechain";

const SKCSAddress = "0xbc482CfD97f7083A4b18F93880c75b19Be5a1201";

export async function addUnderlyingValidator(hre:HardhatRuntimeEnvironment, validator:string, weight:bigint) {
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
    console.log(`after added a new validator, current active validators: ${after}`);
  }
}

export async function lisUnderlyingValidators(hre:HardhatRuntimeEnvironment) {

  const validators = await SKCS__factory.connect(SKCSAddress, hre.ethers.provider).getActiveValidators()

  console.log(`current validators: ${validators}`);
}