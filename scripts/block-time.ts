// Changes how often the running Hardhat node mines a block, without a restart.
// Usage: tsx scripts/block-time.ts 1000   (milliseconds; the default at startup is 3000)
import { JsonRpcProvider } from "ethers";
import { RPC_URL } from "../shared/deployment.ts";

const intervalMs = Number(process.argv[2]);
if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
  console.error("Usage: npm run chain:block-time <milliseconds>   e.g. npm run chain:block-time 1000");
  process.exit(1);
}

const provider = new JsonRpcProvider(RPC_URL);
await provider.send("evm_setIntervalMining", [intervalMs]);
console.log(`Blocks are now mined every ${intervalMs} ms`);
provider.destroy();
