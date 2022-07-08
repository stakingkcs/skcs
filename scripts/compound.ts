import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getSignerFromKeystore } from "./keystore";
import { SKCS__factory } from "../typechain";



export async function compound(hre:HardhatRuntimeEnvironment) {
  const SKCSAddress = "0xbc482CfD97f7083A4b18F93880c75b19Be5a1201";

  const signer = await getSignerFromKeystore(hre);

  const tx = await SKCS__factory.connect(SKCSAddress, signer).compound();
  await tx.wait(2);
  console.log(`compound was successful`);
}