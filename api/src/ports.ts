import type { NonceStrategyName } from "./config.ts";

// The API's dependencies on the outside world. createApp receives
// implementations of these, so the component tests can pass in fakes.

export type TokenSymbol = "TKA" | "TKB";

export interface Clock {
  now(): number; // milliseconds since epoch
}

export interface PriceClient {
  /** Throws PriceProviderError when the provider fails. */
  getPrice(pair: string): Promise<{ pair: string; price: number; timestamp: string }>;
}

export type SwapRequest = {
  from: TokenSymbol;
  to: TokenSymbol;
  amountIn: bigint;
  minAmountOut: bigint;
};

export type SwappedEvent = {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  amountOut: bigint;
  fee: bigint;
};

export type SwapFailure = { code: string; message: string };

export interface ChainClient {
  /** Signs and submits the swap transaction. Resolves with the tx hash as soon as the node accepts it. */
  sendSwap(request: SwapRequest): Promise<string>;
  /** Resolves when the transaction is mined: null if it succeeded, the failure if it reverted. */
  waitForFailure(txHash: string): Promise<SwapFailure | null>;
  getBlockNumber(): Promise<number>;
  getSwappedEvents(fromBlock: number, toBlock: number): Promise<SwappedEvent[]>;
  /** Protocol fee charged by MiniSwap, in basis points (30 = 0.3%). */
  getFeeBps(): Promise<number>;
  /** Token balances of the account that signs the swaps. */
  getBalances(): Promise<{ account: string; balances: Record<TokenSymbol, bigint> }>;
  /** Demo control: how nonces are chosen for the next transactions. */
  getNonceStrategy(): NonceStrategyName;
  setNonceStrategy(name: NonceStrategyName): void;
}
