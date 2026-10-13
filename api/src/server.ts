// Starts the API with the real dependencies: HTTP price provider and local blockchain.
import { readDeployment, RPC_URL, TRADER_PRIVATE_KEY } from "../../shared/deployment.ts";
import { createApp } from "./app.ts";
import { createChainClient } from "./chainClient.ts";
import { loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { createHttpPriceClient } from "./priceClient.ts";

const config = loadConfig();
const deployment = readDeployment();

const { app, indexer } = createApp({
  config,
  clock: { now: () => Date.now() },
  priceClient: createHttpPriceClient({ baseUrl: config.priceProviderUrl, timeoutMs: config.priceTimeoutMs }),
  chainClient: createChainClient({
    rpcUrl: RPC_URL,
    privateKey: TRADER_PRIVATE_KEY,
    deployment,
    nonceStrategy: config.nonceStrategy,
  }),
  indexerStartBlock: deployment.deployedAtBlock,
});

indexer.start();
app.listen(config.port, () => {
  createLogger({ service: "api" }).info("api listening", {
    url: `http://127.0.0.1:${config.port}`,
    nonceStrategy: config.nonceStrategy,
    miniSwap: deployment.miniSwap,
  });
});
