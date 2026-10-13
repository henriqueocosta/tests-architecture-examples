import { defineConfig } from "hardhat/config";

// Blocks are mined on a fixed interval (automine off) so that the
// asynchronous confirmation of a swap is visible in the demos.
const miningIntervalMs = Number(process.env.MINING_INTERVAL_MS ?? 3000);

export default defineConfig({
  solidity: "0.8.28",
  networks: {
    // `hardhat node` uses the network named "node" by default.
    node: {
      type: "edr-simulated",
      chainType: "l1",
      mining: { auto: false, interval: miningIntervalMs },
    },
  },
});
