// Provider side of the contract: replays every interaction in pacts/ against
// the API built by createApp (real routes and serialization). Provider states
// set up the fakes and the in-memory store.
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { Server } from "node:http";
import { Verifier } from "@pact-foundation/pact";
import { createApp } from "../../api/src/app.ts";
import { createHttpPriceClient } from "../../api/src/priceClient.ts";
import { toUnits } from "../../api/src/amounts.ts";
import { createFakeChainClient } from "../support/fakeChainClient.ts";
import { createFakeClock } from "../support/fakeClock.ts";
import { behaviors, startFakePriceProvider } from "../support/fakePriceProvider.ts";
import { testConfig } from "../support/testConfig.ts";
import type { Quote, Swap } from "../../api/src/store.ts";

const clock = createFakeClock();
const config = testConfig();

// Data put in the API's store by the provider states.
function quoteFixture(quoteId: string, expiresAt: number): Quote {
  return { quoteId, from: "TKA", to: "TKB", amountIn: "100.0", amountOut: "199.4", fee: "0.6", feeBps: 30, price: 2, expiresAt };
}

function swapFixture(swapId: string, outcome: Partial<Swap>): Swap {
  return {
    swapId,
    quoteId: "5f0c3b8e-8a3a-4f7e-9d0f-2a6f1f1c9b10",
    from: "TKA",
    to: "TKB",
    amountIn: "100.0",
    expectedAmountOut: "199.4",
    minAmountOut: "197.406",
    txHash: "0x" + "ab".repeat(32),
    status: "pending",
    createdAt: new Date(clock.now()).toISOString(),
    correlationId: "contract-test",
    ...outcome,
  };
}

const CONFIRMED = {
  status: "confirmed",
  confirmedAt: new Date(clock.now()).toISOString(),
  blockNumber: 42,
  amountOut: "199.4",
  fee: "0.6",
} as const;

describe("Contract (provider): API honors pacts/MiniDexWeb-MiniDexApi.json", () => {
  let priceProvider: Awaited<ReturnType<typeof startFakePriceProvider>>;
  let api: ReturnType<typeof createApp>;
  let server: Server;
  const chain = createFakeChainClient();

  before(async () => {
    priceProvider = await startFakePriceProvider();
    api = createApp({
      config,
      clock,
      priceClient: createHttpPriceClient({ baseUrl: priceProvider.url, timeoutMs: config.priceTimeoutMs }),
      chainClient: chain.client,
    });
    server = api.app.listen(0, "127.0.0.1");
    await once(server, "listening");
  });

  after(async () => {
    server.close();
    await priceProvider.close();
  });

  it("satisfies every interaction expected by the web front-end", async function () {
    this.timeout(30_000);

    const verifier = new Verifier({
      provider: "MiniDexApi",
      providerBaseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      pactUrls: [path.resolve("pacts/MiniDexWeb-MiniDexApi.json")],
      logLevel: "warn",
      stateHandlers: {
        "the price provider is available": async () => {
          priceProvider.respondWith(behaviors.normal);
        },
        "the price provider is down": async () => {
          priceProvider.respondWith(behaviors.down);
        },
        "the price provider is slow": async () => {
          priceProvider.respondWith(behaviors.slow(config.priceTimeoutMs + 300));
        },
        "the price provider sends invalid responses": async () => {
          priceProvider.respondWith(behaviors.invalidJson);
        },
        "a valid quote exists": async (params: any) => {
          api.store.saveQuote(quoteFixture(params.quoteId, clock.now() + config.quoteTtlMs));
        },
        "an expired quote exists": async (params: any) => {
          api.store.saveQuote(quoteFixture(params.quoteId, clock.now() - 1));
        },
        "the trading account has balances": async () => {
          chain.setBalances({ TKA: toUnits("1000000"), TKB: toUnits("1000000") });
        },
        "a confirmed swap exists": async (params: any) => {
          api.store.saveSwap(swapFixture(params.swapId, CONFIRMED));
        },
        "a pending swap exists": async (params: any) => {
          api.store.saveSwap(swapFixture(params.swapId, { status: "pending" }));
        },
        "a failed swap exists": async (params: any) => {
          api.store.saveSwap(
            swapFixture(params.swapId, {
              status: "failed",
              failure: { code: "SLIPPAGE_EXCEEDED", message: "On-chain price moved: would receive 149.55, minimum accepted 197.406" },
            }),
          );
        },
        "a swap exists in the history": async () => {
          api.store.clear(); // exactly one row, whatever the previous states left
          api.store.saveSwap(swapFixture("0b6b2a9e-3d4e-4c55-8f8e-6a1d2c3b4a59", CONFIRMED));
        },
      },
    });

    try {
      await verifier.verifyProvider();
    } catch {
      // Pact already printed a readable diff under "Failures:" above; its raw error is a huge JSON blob.
      throw new Error("The API no longer honors the contract expected by the front-end (see Failures above)");
    }
  });
});
