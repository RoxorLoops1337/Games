const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  console.log(`\nDeploying to ${network} as ${deployer.address}`);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} ETH\n`);

  const tokenName = process.env.TOKEN_NAME || "Fan Coin";
  const tokenSymbol = process.env.TOKEN_SYMBOL || "FAN";
  const tokenMaxSupply = hre.ethers.parseUnits(
    process.env.TOKEN_MAX_SUPPLY || "1000000000",
    18
  );

  const nftName = process.env.NFT_NAME || "Fan Pass";
  const nftSymbol = process.env.NFT_SYMBOL || "FANPASS";
  const nftBaseURI = process.env.NFT_BASE_URI || "ipfs://REPLACE_ME/";
  const nftMaxSupply = BigInt(process.env.NFT_MAX_SUPPLY || "10000");
  const nftPublicPrice = hre.ethers.parseEther(
    process.env.NFT_PUBLIC_PRICE_ETH || "0.001"
  );

  console.log("Deploying FanToken...");
  const FanToken = await hre.ethers.getContractFactory("FanToken");
  const token = await FanToken.deploy(
    tokenName,
    tokenSymbol,
    tokenMaxSupply,
    deployer.address
  );
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log(`  FanToken: ${tokenAddr}`);

  console.log("Deploying FanNFT...");
  const FanNFT = await hre.ethers.getContractFactory("FanNFT");
  const nft = await FanNFT.deploy(
    nftName,
    nftSymbol,
    nftBaseURI,
    nftMaxSupply,
    nftPublicPrice,
    deployer.address
  );
  await nft.waitForDeployment();
  const nftAddr = await nft.getAddress();
  console.log(`  FanNFT:   ${nftAddr}\n`);

  const deployments = {
    network,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      FanToken: {
        address: tokenAddr,
        name: tokenName,
        symbol: tokenSymbol,
        maxSupply: tokenMaxSupply.toString(),
      },
      FanNFT: {
        address: nftAddr,
        name: nftName,
        symbol: nftSymbol,
        baseURI: nftBaseURI,
        maxSupply: nftMaxSupply.toString(),
        publicPriceWei: nftPublicPrice.toString(),
      },
    },
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployments, null, 2));
  console.log(`Wrote ${outFile}`);

  const explorer =
    network === "base"
      ? "https://basescan.org/address/"
      : network === "baseSepolia"
      ? "https://sepolia.basescan.org/address/"
      : "";
  if (explorer) {
    console.log(`\nView on explorer:`);
    console.log(`  Token: ${explorer}${tokenAddr}`);
    console.log(`  NFT:   ${explorer}${nftAddr}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
