import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config({ path: "../.env" });

const PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY || "0000000000000000000000000000000000000000000000000000000000000000";

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    mst: {
      url: process.env.MST_TESTNET_RPC || "https://testnetrpc.mstblockchain.com",
      accounts: [PRIVATE_KEY]
    }
  },
  paths: {
    artifacts: "../frontend/artifacts", // Output for frontend to read ABI
  }
};

export default config;
