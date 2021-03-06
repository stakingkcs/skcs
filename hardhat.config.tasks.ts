import * as dotenv from "dotenv";

import { HardhatUserConfig, task } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "@openzeppelin/hardhat-upgrades";
import { addUnderlyingValidator, lisUnderlyingValidators } from "./scripts/validator";
import { compound } from "./scripts/compound";
import { processRedemption } from "./scripts/processRedemption";

dotenv.config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task("add-underlying-validator", "add a new validator")
  .addParam("validator", "address of validator")
  .addParam("weight", "weight of validator, [0, 100)")
  .setAction( async (taskArgs, hre) => {
    await hre.run("compile");
    await addUnderlyingValidator(hre, taskArgs.validator, taskArgs.weight);
  });

task("compound", "compound operation")
  .setAction( async (taskArgs, hre) => {
    await hre.run("compile");
    await compound(hre);
  });

task("process-redeem", "process all redemption requests")
  .setAction( async (taskArgs, hre) => {
    await hre.run("compile");
    await processRedemption(hre);
  });

task("list-validators", "list all validators")
  .setAction( async (taskArgs, hre) => {
    await hre.run("compile");
    await lisUnderlyingValidators(hre);
  })

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    compilers:[
      {
        version: "0.8.4",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.4.18",
      }
    ]
  },
  networks: {
    ropsten: {
      url: process.env.ROPSTEN_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    testnet: {
      url: "https://rpc-testnet.kcc.network",
      chainId: 322,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],

    },
    mainnet: {
      url: "https://rpc-mainnet.kcc.network",
      chainId: 321,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],

    },

    hardhat: {
      allowUnlimitedContractSize: true,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};

export default config;
