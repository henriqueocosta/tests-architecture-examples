import { randomUUID } from "node:crypto";
import { Router } from "express";
import { convert, deductFee, fromUnits, toUnits } from "../amounts.ts";
import type { Config } from "../config.ts";
import { ApiError } from "../errors.ts";
import type { ChainClient, Clock, PriceClient, TokenSymbol } from "../ports.ts";
import type { Store } from "../store.ts";

const TOKENS: TokenSymbol[] = ["TKA", "TKB"];
const AMOUNT_PATTERN = /^\d+(\.\d{1,18})?$/;

function parseQuoteRequest(query: any): { from: TokenSymbol; to: TokenSymbol; amountIn: bigint } {
  const { from, to, amount } = query;
  if (!TOKENS.includes(from) || !TOKENS.includes(to) || from === to) {
    throw new ApiError(400, "INVALID_REQUEST", "from and to must be different tokens: TKA or TKB");
  }
  if (typeof amount !== "string" || !AMOUNT_PATTERN.test(amount) || toUnits(amount) === 0n) {
    throw new ApiError(400, "INVALID_REQUEST", "amount must be a positive decimal number");
  }
  return { from, to, amountIn: toUnits(amount) };
}

export function quotesRouter({ priceClient, chainClient, clock, config, store }: {
  priceClient: PriceClient;
  chainClient: ChainClient;
  clock: Clock;
  config: Config;
  store: Store;
}) {
  const router = Router();

  router.get("/quotes", async (req, res) => {
    const { from, to, amountIn } = parseQuoteRequest(req.query);
    const { price } = await priceClient.getPrice(`${from}-${to}`);
    // The fee comes from the contract itself, the same source used when the swap executes.
    const feeBps = await chainClient.getFeeBps();
    const { amountOut, fee } = deductFee(convert(amountIn, price), feeBps);

    const quote = {
      quoteId: randomUUID(),
      from,
      to,
      amountIn: fromUnits(amountIn),
      amountOut: fromUnits(amountOut),
      fee: fromUnits(fee),
      feeBps,
      price,
      expiresAt: clock.now() + config.quoteTtlMs,
    };
    store.saveQuote(quote);

    res.json({
      quoteId: quote.quoteId,
      from: quote.from,
      to: quote.to,
      amountIn: quote.amountIn,
      amountOut: quote.amountOut,
      fee: quote.fee,
      feeBps: quote.feeBps,
      price: quote.price,
      expiresAt: new Date(quote.expiresAt).toISOString(),
    });
  });

  return router;
}
