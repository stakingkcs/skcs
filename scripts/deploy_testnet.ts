import { ethers, upgrades } from "hardhat";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');
  const [singer] = await ethers.getSigners();
  console.log(`admin of sKCS: `, singer.address);

  // deploy process redemption
  console.log(`ready to deploy process redemption contract...`);
  const redemption = await ethers.getContractFactory(
    "sKCSProcessRedemptionsFacet"
  );
  const facet = await upgrades.deployProxy(redemption);
  await facet.deployed();

  console.log(`facet address: ${facet.address}`);

  const wkcs = "0x6551358EDC7fee9ADAB1E2E49560E68a12E82d9e";
  const validatorContract = "0x000000000000000000000000000000000000f333";
  const protocolFee = 1000;
  const minStakingKCSAmount = ethers.constants.WeiPerEther;
  const maximumPendingRedemptionRequestPerUser = 200;

  // deploy sKCS
  console.log(`ready to deploy sKCS contract...`);
  const sKCS = await ethers.getContractFactory("sKCS");

  const skcs = await upgrades.deployProxy(
    sKCS,
    [
      wkcs,
      validatorContract,
      facet.address,
      protocolFee,
      minStakingKCSAmount,
      maximumPendingRedemptionRequestPerUser,
      singer.address,
    ],
    { initializer: "initialize" }
  );
  await skcs.deployed();
  console.log(`skcs address: ${skcs.address}`);

  /*
  *
  ready to deploy process redemption contract...
  facet address: 0xe6a6D0B0dA92476d428e6ea33bB013fE1394364f
  ready to deploy sKCS contract...
  skcs address: 0xbc482CfD97f7083A4b18F93880c75b19Be5a1201
  */
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
