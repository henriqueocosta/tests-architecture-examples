export type NonceStrategyName = "naive" | "managed";

export type Config = {
  port: number;
  priceProviderUrl: string;
  priceTimeoutMs: number;
  quoteTtlMs: number;
  slippageBps: number; // 100 = 1%
  nonceStrategy: NonceStrategyName;
  indexerPollMs: number;
};

export function loadConfig(env = process.env): Config {
  const nonceStrategy = env.NONCE_STRATEGY ?? "naive";
  if (nonceStrategy !== "naive" && nonceStrategy !== "managed") {
    throw new Error(`NONCE_STRATEGY must be "naive" or "managed", got "${nonceStrategy}"`);
  }
  return {
    port: Number(env.PORT ?? 3000),
    priceProviderUrl: env.PRICE_PROVIDER_URL ?? "http://127.0.0.1:4001",
    priceTimeoutMs: Number(env.PRICE_TIMEOUT_MS ?? 2000),
    quoteTtlMs: Number(env.QUOTE_TTL_MS ?? 15000),
    slippageBps: Number(env.SLIPPAGE_BPS ?? 100),
    nonceStrategy,
    indexerPollMs: Number(env.INDEXER_POLL_MS ?? 1000),
  };
}
