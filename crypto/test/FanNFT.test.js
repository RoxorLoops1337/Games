const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FanNFT", function () {
  const NAME = "Fan Pass";
  const SYMBOL = "FANPASS";
  const BASE_URI = "ipfs://bafy.../";
  const MAX = 100n;
  const PRICE = ethers.parseEther("0.001");

  async function deploy() {
    const [owner, alice, bob] = await ethers.getSigners();
    const FanNFT = await ethers.getContractFactory("FanNFT");
    const nft = await FanNFT.deploy(NAME, SYMBOL, BASE_URI, MAX, PRICE, owner.address);
    return { nft, owner, alice, bob };
  }

  it("deploys with the right config", async () => {
    const { nft, owner } = await deploy();
    expect(await nft.name()).to.equal(NAME);
    expect(await nft.symbol()).to.equal(SYMBOL);
    expect(await nft.maxSupply()).to.equal(MAX);
    expect(await nft.publicPrice()).to.equal(PRICE);
    expect(await nft.owner()).to.equal(owner.address);
    expect(await nft.publicMintOpen()).to.equal(false);
  });

  it("owner can free-mint to a fan", async () => {
    const { nft, alice } = await deploy();
    await nft.ownerMint(alice.address);
    expect(await nft.balanceOf(alice.address)).to.equal(1n);
    expect(await nft.ownerOf(1)).to.equal(alice.address);
    expect(await nft.tokenURI(1)).to.equal(`${BASE_URI}1`);
  });

  it("rejects public mint when closed", async () => {
    const { nft, alice } = await deploy();
    await expect(nft.connect(alice).publicMint(1, { value: PRICE }))
      .to.be.revertedWithCustomError(nft, "PublicMintClosed");
  });

  it("public mint requires correct payment", async () => {
    const { nft, alice } = await deploy();
    await nft.setPublicMintOpen(true);
    await expect(nft.connect(alice).publicMint(2, { value: PRICE }))
      .to.be.revertedWithCustomError(nft, "InsufficientPayment");
    await nft.connect(alice).publicMint(2, { value: PRICE * 2n });
    expect(await nft.balanceOf(alice.address)).to.equal(2n);
  });

  it("respects max supply", async () => {
    const [owner, alice] = await ethers.getSigners();
    const FanNFT = await ethers.getContractFactory("FanNFT");
    const nft = await FanNFT.deploy(NAME, SYMBOL, BASE_URI, 2n, PRICE, owner.address);
    await nft.ownerMint(alice.address);
    await nft.ownerMint(alice.address);
    await expect(nft.ownerMint(alice.address))
      .to.be.revertedWithCustomError(nft, "MaxSupplyReached");
  });

  it("ownerBatchMint mints to many fans", async () => {
    const { nft, alice, bob } = await deploy();
    await nft.ownerBatchMint([alice.address, bob.address, alice.address]);
    expect(await nft.balanceOf(alice.address)).to.equal(2n);
    expect(await nft.balanceOf(bob.address)).to.equal(1n);
    expect(await nft.totalSupply()).to.equal(3n);
  });

  it("tierOf returns Bronze/Silver/Gold", async () => {
    const { nft } = await deploy();
    expect(await nft.tierOf(1)).to.equal("Bronze");
    expect(await nft.tierOf(999)).to.equal("Bronze");
    expect(await nft.tierOf(1000)).to.equal("Silver");
    expect(await nft.tierOf(4999)).to.equal("Silver");
    expect(await nft.tierOf(5000)).to.equal("Gold");
  });

  it("owner can withdraw mint proceeds", async () => {
    const { nft, owner, alice, bob } = await deploy();
    await nft.setPublicMintOpen(true);
    await nft.connect(alice).publicMint(3, { value: PRICE * 3n });
    const before = await ethers.provider.getBalance(bob.address);
    await nft.withdraw(bob.address);
    const after = await ethers.provider.getBalance(bob.address);
    expect(after - before).to.equal(PRICE * 3n);
  });

  it("non-owner cannot toggle mint or withdraw", async () => {
    const { nft, alice } = await deploy();
    await expect(nft.connect(alice).setPublicMintOpen(true))
      .to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
    await expect(nft.connect(alice).withdraw(alice.address))
      .to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
  });
});
