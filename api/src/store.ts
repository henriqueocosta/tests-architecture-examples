// In-memory state. Restarting the API clears everything (accepted for the demo).
import type { SwapFailure, TokenSymbol } from "./ports.ts";

export type Quote = {
  quoteId: string;
  from: TokenSymbol;
  to: TokenSymbol;
  amountIn: string;
  amountOut: string; // after the fee
  fee: string;
  feeBps: number;
  price: number;
  expiresAt: number; // ms since epoch
};

export type SwapStatus = "pending" | "confirmed" | "failed";

export type Swap = {
  swapId: string;
  quoteId: string;
  from: TokenSymbol;
  to: TokenSymbol;
  amountIn: string;
  expectedAmountOut: string;
  minAmountOut: string;
  txHash: string;
  status: SwapStatus;
  createdAt: string;
  correlationId: string;
  confirmedAt?: string;
  blockNumber?: number;
  amountOut?: string;
  fee?: string;
  failure?: SwapFailure;
};

export function createStore() {
  const quotes = new Map<string, Quote>();
  const swaps = new Map<string, Swap>();

  return {
    saveQuote(quote: Quote) {
      quotes.set(quote.quoteId, quote);
    },
    getQuote: (quoteId: string) => quotes.get(quoteId),

    saveSwap(swap: Swap) {
      swaps.set(swap.swapId, swap);
    },
    getSwap: (swapId: string) => swaps.get(swapId),
    findSwapByTxHash: (txHash: string) => [...swaps.values()].find((swap) => swap.txHash === txHash),
    listSwaps: () => [...swaps.values()].reverse(), // newest first

    clear() {
      quotes.clear();
      swaps.clear();
    },
  };
}

export type Store = ReturnType<typeof createStore>;
