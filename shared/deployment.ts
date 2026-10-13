// Helpers shared by the scripts and the API: where the chain is, which
// test accounts are used and where the deployed addresses live.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";

// Well-known Hardhat test accounts (public private keys, never use on a real network).
export const DEPLOYER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // account #0
export const TRADER_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // account #1

export const DEPLOYMENT_FILE = fileURLToPath(new URL("../deployments/local.json", import.meta.url));

export type Deployment = {
  chainId: number;
  deployedAtBlock: number;
  miniSwap: string;
  tokens: { TKA: string; TKB: string };
  /** evm_snapshot taken right after the deploy: `npm run reset` reverts to it. */
  snapshotId: string;
};

export function readDeployment(): Deployment {
  return JSON.parse(readFileSync(DEPLOYMENT_FILE, "utf8"));
}

export function writeDeployment(deployment: Deployment) {
  writeFileSync(DEPLOYMENT_FILE, JSON.stringify(deployment, null, 2) + "\n");
}

export function loadArtifact(contractName: "MiniSwap" | "TestToken"): { abi: any[]; bytecode: string } {
  const path = new URL(`../artifacts/contracts/${contractName}.sol/${contractName}.json`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8"));
}
