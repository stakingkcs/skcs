import hre, { ethers } from "hardhat";
import { getSignerFromKeystore } from "./keystore";
import { SKCS } from "../typechain";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const signer = await getSignerFromKeystore(hre);

  console.log(
    "Deploying contracts with the account: ",
    await signer.getAddress()
  );

  console.log("Account balance: ", (await signer.getBalance()).toString());

  const process = await ethers.getContractFactory(
    "sKCSProcessRedemptionsFacet",
    signer
  );
  const processToken = await process.connect(signer).deploy();

  console.log(
    "sKCSProcessRedemptionsFacet contract address: ",
    processToken.address
  ); // sKCSProcessRedemptionsFacet contract address: 0x0ADb9075C4B51646c5f7910Fd5A5C1DE51199A5C

  const wkcs = "0x6551358EDC7fee9ADAB1E2E49560E68a12E82d9e";
  const validatorContract = "0x000000000000000000000000000000000000f333";
  const protocolFee = 1000;
  const minStakingKCSAmount = ethers.constants.WeiPerEther;
  const maximumPendingRedemptionRequestPerUser = 200;

  const Token = (await ethers.getContractFactory(
    "sKCS",
    signer
  )) as unknown as SKCS;
  const tx = await Token.connect(signer)
    .attach("0xDF08Cb011FfB6Fe7fE86266112F41f77dcEB0C6f")
    .initialize(
      wkcs,
      validatorContract,
      processToken.address,
      protocolFee,
      minStakingKCSAmount,
      maximumPendingRedemptionRequestPerUser,
      "0xCaBC2DCBF4F4dAc7406De51aE61228d570627E42" // skcs account
    );

  await tx.wait(2);

  console.log("sKCS contract init was successful!");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
