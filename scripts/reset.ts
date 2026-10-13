// Puts the running stack back in its initial state, without restarting it:
// chain reverted to the post-deploy snapshot, 3 s blocks, price provider
// normal, API memory cleared and nonce strategy back to its default.
import { JsonRpcProvider } from "ethers";
import { RPC_URL, readDeployment, writeDeployment } from "../shared/deployment.ts";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3000";
const PRICE_PROVIDER_URL = process.env.PRICE_PROVIDER_URL ?? "http://127.0.0.1:4001";
const MINING_INTERVAL_MS = Number(process.env.MINING_INTERVAL_MS ?? 3000);

async function post(url: string, body: object) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

try {
  await fetch(`${API_URL}/health`);
} catch {
  console.error("The stack is not running. `npm run dev` already starts from a clean state.");
  process.exit(1);
}

const provider = new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 });
const deployment = readDeployment();

// 1. Blockchain: back to the state right after the deploy (snapshots are single-use: take a new one).
const reverted = await provider.send("evm_revert", [deployment.snapshotId]);
if (!reverted) {
  console.error("Could not revert the chain to the initial snapshot. Restart with: npm run dev");
  process.exit(1);
}
writeDeployment({ ...deployment, snapshotId: await provider.send("evm_snapshot", []) });
await provider.send("evm_setIntervalMining", [MINING_INTERVAL_MS]);
console.log(`Blockchain: back to block ${await provider.getBlockNumber()}, blocks every ${MINING_INTERVAL_MS} ms`);
provider.destroy();

// 2. Price provider: normal mode.
await post(`${PRICE_PROVIDER_URL}/__control`, { mode: "normal" });
console.log("Price provider: normal");

// 3. API: empty history, indexer running from the deploy block, default nonce strategy.
const api = await post(`${API_URL}/__control/reset`, {});
console.log(`API: memory cleared, nonce strategy ${api.nonceStrategy}, indexer ${api.indexer.paused ? "paused" : "running"}`);
