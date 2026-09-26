import "@nomicfoundation/hardhat-toolbox-viem";
import type { HardhatUserConfig } from "hardhat/config";

/**
 * Networks are only used for deployment. The deployer key is read from the environment on the
 * machine that deploys (the server), never committed and never printed.
 */
const key = process.env.ORACLE_PUBLISHER_KEY;
const accounts = key ? [key.startsWith("0x") ? key : `0x${key}`] : [];

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: { optimizer: { enabled: true, runs: 1_000 }, evmVersion: "cancun" },
      },
      {
        // Uniswap v4 (PoolManager, BaseHook) and our hook: same settings as Uniswap's own build.
        version: "0.8.26",
        settings: { optimizer: { enabled: true, runs: 44_444_444 }, evmVersion: "cancun", viaIR: true },
      },
    ],
  },
  networks: {
    // Local smoke tests of the server code can pretend to be the Robinhood testnet.
    hardhat: {
      chainId: Number(process.env.HARDHAT_CHAIN_ID || 31337),
      // Uniswap v4 PoolManager is above the 24 KB limit when built for tests.
      allowUnlimitedContractSize: true,
    },
    robinhood: {
      url: process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      accounts,
    },
    robinhoodTestnet: {
      url: process.env.ROBINHOOD_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com",
      chainId: 46630,
      accounts,
    },
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      chainId: 421614,
      accounts,
    },
  },
  // Source verification on Robinhood Chain's Blockscout (no key needed; any string works).
  etherscan: {
    apiKey: { robinhood: "blockscout" },
    customChains: [
      {
        network: "robinhood",
        chainId: 4663,
        urls: {
          apiURL: "https://robinhoodchain.blockscout.com/api",
          browserURL: "https://robinhoodchain.blockscout.com",
        },
      },
    ],
  },
  // Blockscout sits behind a bot challenge; Sourcify (which Blockscout reads) is the open path.
  sourcify: { enabled: true },
};

export default config;
