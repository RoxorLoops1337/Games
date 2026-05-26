const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FanToken", function () {
  const NAME = "Fan Coin";
  const SYMBOL = "FAN";
  const MAX = ethers.parseUnits("1000000", 18);

  async function deploy() {
    const [owner, alice, bob, carol] = await ethers.getSigners();
    const FanToken = await ethers.getContractFactory("FanToken");
    const token = await FanToken.deploy(NAME, SYMBOL, MAX, owner.address);
    return { token, owner, alice, bob, carol };
  }

  it("sets name, symbol, max supply, and owner", async () => {
    const { token, owner } = await deploy();
    expect(await token.name()).to.equal(NAME);
    expect(await token.symbol()).to.equal(SYMBOL);
    expect(await token.maxSupply()).to.equal(MAX);
    expect(await token.owner()).to.equal(owner.address);
    expect(await token.totalSupply()).to.equal(0n);
  });

  it("owner can mint up to the cap", async () => {
    const { token, alice } = await deploy();
    await token.mint(alice.address, ethers.parseUnits("100", 18));
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseUnits("100", 18));
  });

  it("reverts when minting past the cap", async () => {
    const { token, alice } = await deploy();
    await expect(token.mint(alice.address, MAX + 1n))
      .to.be.revertedWithCustomError(token, "MaxSupplyExceeded");
  });

  it("non-owners cannot mint", async () => {
    const { token, alice } = await deploy();
    await expect(token.connect(alice).mint(alice.address, 1n))
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
  });

  it("batchMint distributes rewards", async () => {
    const { token, alice, bob, carol } = await deploy();
    const amts = [
      ethers.parseUnits("10", 18),
      ethers.parseUnits("20", 18),
      ethers.parseUnits("30", 18),
    ];
    await token.batchMint([alice.address, bob.address, carol.address], amts);
    expect(await token.balanceOf(alice.address)).to.equal(amts[0]);
    expect(await token.balanceOf(bob.address)).to.equal(amts[1]);
    expect(await token.balanceOf(carol.address)).to.equal(amts[2]);
  });

  it("batchMint rejects mismatched arrays", async () => {
    const { token, alice } = await deploy();
    await expect(token.batchMint([alice.address], [1n, 2n]))
      .to.be.revertedWithCustomError(token, "ArrayLengthMismatch");
  });

  it("holders can burn their own tokens", async () => {
    const { token, alice } = await deploy();
    await token.mint(alice.address, ethers.parseUnits("100", 18));
    await token.connect(alice).burn(ethers.parseUnits("40", 18));
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseUnits("60", 18));
  });
});
