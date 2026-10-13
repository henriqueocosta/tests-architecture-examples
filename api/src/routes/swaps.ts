import { randomUUID } from "node:crypto";
import { Router } from "express";
import { applySlippage, fromUnits, toUnits } from "../amounts.ts";
import { describeChainError } from "../chainClient.ts";
import type { Config } from "../config.ts";
import { ApiError } from "../errors.ts";
import type { ChainClient, Clock } from "../ports.ts";
import type { Store, Swap } from "../store.ts";

export function swapsRouter({ chainClient, clock, config, store }: {
  chainClient: ChainClient;
  clock: Clock;
  config: Config;
  store: Store;
}) {
  const router = Router();

  router.post("/swaps", async (req, res) => {
    const { quoteId } = req.body ?? {};
    if (typeof quoteId !== "string") {
      throw new ApiError(400, "INVALID_REQUEST", "quoteId is required");
    }
    const quote = store.getQuote(quoteId);
    if (!quote) {
      throw new ApiError(404, "QUOTE_NOT_FOUND", `Quote ${quoteId} does not exist`);
    }
    if (clock.now() >= quote.expiresAt) {
      throw new ApiError(410, "QUOTE_EXPIRED", "Quote has expired, request a new one");
    }

    const minAmountOut = applySlippage(toUnits(quote.amountOut), config.slippageBps);
    let txHash: string;
    try {
      txHash = await chainClient.sendSwap({
        from: quote.from,
        to: quote.to,
        amountIn: toUnits(quote.amountIn),
        minAmountOut,
      });
    } catch (err) {
      throw new ApiError(500, "TX_SUBMISSION_FAILED", describeChainError(err));
    }

    const swap: Swap = {
      swapId: randomUUID(),
      quoteId,
      from: quote.from,
      to: quote.to,
      amountIn: quote.amountIn,
      expectedAmountOut: quote.amountOut,
      minAmountOut: fromUnits(minAmountOut),
      txHash,
      status: "pending",
      createdAt: new Date(clock.now()).toISOString(),
      correlationId: res.locals.correlationId,
    };
    store.saveSwap(swap);
    res.locals.log.info("swap submitted", { swapId: swap.swapId, txHash });

    // Confirmation comes from the indexer; a revert is detected here, from the receipt.
    chainClient
      .waitForFailure(txHash)
      .then((failure) => {
        if (!failure) return;
        swap.status = "failed";
        swap.failure = failure;
        res.locals.log.warn("swap failed", { swapId: swap.swapId, ...failure });
      })
      .catch((err) => res.locals.log.warn("could not follow swap transaction", { txHash, reason: err.message }));

    res.status(202).json({ swapId: swap.swapId, txHash, status: swap.status });
  });

  router.get("/swaps", (_req, res) => {
    res.json({ swaps: store.listSwaps() });
  });

  router.get("/swaps/:id", (req, res) => {
    const swap = store.getSwap(req.params.id);
    if (!swap) {
      throw new ApiError(404, "SWAP_NOT_FOUND", `Swap ${req.params.id} does not exist`);
    }
    res.json(swap);
  });

  return router;
}
