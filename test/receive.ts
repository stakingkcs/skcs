import { expect } from "chai";
import { CreateContext } from "./context";

describe("receive", function () {
  it("receive from EOA", async function() {
    const context = await CreateContext();
    const [user] = context.users;

    // console.log(`${await ethers.provider.getBalance(user.address)}`);
    await expect(user.sendTransaction({to: context.SKCS.address, value: 1000000})).to.be.reverted;
  });
})