const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/// Reads a JSON file of { address, tokenAmount, nft } entries and dispatches rewards.
/// Example rewards.json:
/// [
///   { "address": "0xabc...", "tokenAmount": "100", "nft": true },
///   { "address": "0xdef...", "tokenAmount": "50",  "nft": false }
/// ]
async function main() {
  const network = hre.network.name;
  const deploymentsPath = path.join(__dirname, "..", "deployments", `${network}.json`);
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error(`No deployment found for ${network}. Run deploy first.`);
  }
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

  const rewardsPath = process.env.REWARDS_FILE || path.join(__dirname, "..", "rewards.json");
  if (!fs.existsSync(rewardsPath)) {
    throw new Error(`Rewards file not found: ${rewardsPath}`);
  }
  const rewards = JSON.parse(fs.readFileSync(rewardsPath, "utf8"));

  const token = await hre.ethers.getContractAt("FanToken", deployments.contracts.FanToken.address);
  const nft = await hre.ethers.getContractAt("FanNFT", deployments.contracts.FanNFT.address);

  const tokenRecipients = [];
  const tokenAmounts = [];
  const nftRecipients = [];

  for (const r of rewards) {
    if (r.tokenAmount && Number(r.tokenAmount) > 0) {
      tokenRecipients.push(r.address);
      tokenAmounts.push(hre.ethers.parseUnits(String(r.tokenAmount), 18));
    }
    if (r.nft) nftRecipients.push(r.address);
  }

  if (tokenRecipients.length) {
    console.log(`Minting tokens to ${tokenRecipients.length} fans...`);
    const tx = await token.batchMint(tokenRecipients, tokenAmounts);
    console.log(`  tx: ${tx.hash}`);
    await tx.wait();
  }

  if (nftRecipients.length) {
    console.log(`Minting NFTs to ${nftRecipients.length} fans...`);
    const tx = await nft.ownerBatchMint(nftRecipients);
    console.log(`  tx: ${tx.hash}`);
    await tx.wait();
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
