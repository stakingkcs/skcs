import * as readline from 'readline-sync';
import {readdirSync, readFileSync} from "fs";
import {Signer, Wallet} from "ethers";
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import * as fs from "fs";
import * as path from "path";

/**
 * Read the keystore json path from environment variable "KEYSTORE_JSON_PATH"
 * or stdin.
 */
export async function getSignerFromKeystore(hre:HardhatRuntimeEnvironment){

  let path = process.env.KEYSTORE_JSON_PATH;
  if(path == null){
    path = readline.question("The path of keystore json file:");
  }
  // password
  const password = readline.question("Password of the keystore:", {hideEchoBack: true});

  // Load keystore json
  const keystoreJSON = readFileSync(path,{encoding:'utf8', flag:'r'})

  return Wallet.fromEncryptedJsonSync(keystoreJSON,password).connect(hre.ethers.provider) as Signer;

}