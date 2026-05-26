const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  const deploymentsPath = path.join(__dirname, "..", "deployments", `${network}.json`);
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error(`No deployment found for ${network}. Run deploy first.`);
  }
  const d = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

  const tokenArgs = [
    d.contracts.FanToken.name,
    d.contracts.FanToken.symbol,
    d.contracts.FanToken.maxSupply,
    d.deployer,
  ];
  const nftArgs = [
    d.contracts.FanNFT.name,
    d.contracts.FanNFT.symbol,
    d.contracts.FanNFT.baseURI,
    d.contracts.FanNFT.maxSupply,
    d.contracts.FanNFT.publicPriceWei,
    d.deployer,
  ];

  console.log(`Verifying FanToken at ${d.contracts.FanToken.address}...`);
  try {
    await hre.run("verify:verify", {
      address: d.contracts.FanToken.address,
      constructorArguments: tokenArgs,
    });
  } catch (e) {
    console.log(`  ${e.message}`);
  }

  console.log(`Verifying FanNFT at ${d.contracts.FanNFT.address}...`);
  try {
    await hre.run("verify:verify", {
      address: d.contracts.FanNFT.address,
      constructorArguments: nftArgs,
    });
  } catch (e) {
    console.log(`  ${e.message}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
