// Control routes used only by the demos and tests.
import { Router } from "express";
import { ApiError } from "../errors.ts";
import type { Indexer } from "../indexer.ts";
import type { ChainClient } from "../ports.ts";

export function controlRouter({
  indexer,
  chainClient,
  resetState,
}: {
  indexer: Indexer;
  chainClient: ChainClient;
  resetState: () => void;
}) {
  const router = Router();

  router.post("/__control/reset", (_req, res) => {
    resetState();
    res.json({ reset: true, nonceStrategy: chainClient.getNonceStrategy(), indexer: indexer.status() });
  });

  router.get("/__control/indexer", (_req, res) => {
    res.json(indexer.status());
  });

  router.post("/__control/indexer", (req, res) => {
    const { paused } = req.body ?? {};
    if (typeof paused !== "boolean") {
      throw new ApiError(400, "INVALID_REQUEST", "paused must be true or false");
    }
    indexer.setPaused(paused);
    res.json(indexer.status());
  });

  router.post("/__control/indexer/replay", async (req, res) => {
    const { fromBlock } = req.body ?? {};
    if (!Number.isInteger(fromBlock) || fromBlock < 0) {
      throw new ApiError(400, "INVALID_REQUEST", "fromBlock must be a non-negative integer");
    }
    res.json(await indexer.replay(fromBlock));
  });

  // Switches the nonce strategy at runtime, so the performance demos do not
  // need to restart the stack (the NONCE_STRATEGY env var sets the initial one).
  router.get("/__control/nonce-strategy", (_req, res) => {
    res.json({ nonceStrategy: chainClient.getNonceStrategy() });
  });

  router.post("/__control/nonce-strategy", (req, res) => {
    const { nonceStrategy } = req.body ?? {};
    if (nonceStrategy !== "naive" && nonceStrategy !== "managed") {
      throw new ApiError(400, "INVALID_REQUEST", 'nonceStrategy must be "naive" or "managed"');
    }
    chainClient.setNonceStrategy(nonceStrategy);
    res.locals.log.info("nonce strategy changed", { nonceStrategy });
    res.json({ nonceStrategy });
  });

  return router;
}
