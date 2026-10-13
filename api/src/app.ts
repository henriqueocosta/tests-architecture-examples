import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import type { Config } from "./config.ts";
import { errorHandler } from "./errors.ts";
import { createIndexer } from "./indexer.ts";
import { createLogger } from "./logger.ts";
import type { ChainClient, Clock, PriceClient } from "./ports.ts";
import { balancesRouter } from "./routes/balances.ts";
import { controlRouter } from "./routes/control.ts";
import { quotesRouter } from "./routes/quotes.ts";
import { swapsRouter } from "./routes/swaps.ts";
import { createStore } from "./store.ts";

const WEB_DIR = fileURLToPath(new URL("../../web", import.meta.url));

export type AppDependencies = {
  priceClient: PriceClient;
  chainClient: ChainClient;
  clock: Clock;
  config: Config;
  indexerStartBlock?: number;
};

/** Builds the API. The indexer is created but not started: the caller decides. */
export function createApp({ priceClient, chainClient, clock, config, indexerStartBlock = 0 }: AppDependencies) {
  const log = createLogger({ service: "api" });
  const store = createStore();
  const indexer = createIndexer({
    chainClient,
    store,
    log,
    startBlock: indexerStartBlock,
    pollMs: config.indexerPollMs,
  });

  const app = express();
  app.use(express.json());

  // Correlation ID: taken from the caller or generated, returned and attached to every log line.
  app.use((req, res, next) => {
    const correlationId = req.get("x-correlation-id") ?? randomUUID();
    const startedAt = performance.now();
    res.set("x-correlation-id", correlationId);
    res.locals.correlationId = correlationId;
    res.locals.log = log.child({ correlationId });
    res.on("finish", () => {
      res.locals.log.info("request", {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      });
    });
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use(quotesRouter({ priceClient, chainClient, clock, config, store }));
  app.use(swapsRouter({ chainClient, clock, config, store }));
  app.use(balancesRouter({ chainClient }));
  // Back to the initial state, after `npm run reset` has reverted the chain.
  const resetState = () => {
    store.clear();
    indexer.reset();
    chainClient.setNonceStrategy(config.nonceStrategy);
    log.info("state reset");
  };
  app.use(controlRouter({ indexer, chainClient, resetState }));
  app.use(express.static(WEB_DIR));
  app.use(errorHandler);

  return { app, indexer, store };
}
