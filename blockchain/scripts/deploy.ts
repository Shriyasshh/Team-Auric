import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  
  console.log("Deployer Address:", deployer.address);
  console.log("Deployer Balance:", ethers.formatEther(balance), "MST");

  if (balance === 0n) {
    console.error("Deployer has no balance! Please fund the address.");
    process.exit(1);
  }

  console.log("Deploying MediVaultAnchor...");
  const Anchor = await ethers.getContractFactory("MediVaultAnchor");
  const anchor = await Anchor.deploy();

  await anchor.waitForDeployment();
  const address = await anchor.getAddress();

  console.log("MediVaultAnchor deployed to:", address);
  
  // Try to find the deployment transaction
  const receipt = await anchor.deploymentTransaction()?.wait();
  if (receipt) {
    console.log("Deployment Transaction Hash:", receipt.hash);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
