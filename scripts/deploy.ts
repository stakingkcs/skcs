// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import  hre from "hardhat";
import { getSignerFromKeystore } from "./keystore";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const signer = await getSignerFromKeystore(hre);

  console.log("Deploying contracts with the account: ", await signer.getAddress());

  console.log("Account balance: ", (await signer.getBalance()).toString());

  const Token = await ethers.getContractFactory("sKCS", signer);
  const token = await Token.connect(signer).deploy();

  console.log("sKCS contract address: ", token.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
