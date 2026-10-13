import type { Config } from "../../api/src/config.ts";

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    priceProviderUrl: "unused",
    priceTimeoutMs: 200,
    quoteTtlMs: 15_000,
    slippageBps: 100,
    nonceStrategy: "naive",
    indexerPollMs: 1000,
    ...overrides,
  };
}
