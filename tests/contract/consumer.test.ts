// Consumer side of the contract: exercises the real front-end module
// web/apiClient.js against a Pact mock server and writes pacts/*.json.
import path from "node:path";
import { expect } from "chai";
import { MatchersV3, PactV4 } from "@pact-foundation/pact";
import { ApiError, createApiClient } from "../../web/apiClient.js";

const { like, uuid, regex, eachLike, iso8601DateTimeWithMillis } = MatchersV3;

const QUOTE_ID = "5f0c3b8e-8a3a-4f7e-9d0f-2a6f1f1c9b10";
const EXPIRED_QUOTE_ID = "7d1e2f3a-4b5c-4d6e-8f70-81a2b3c4d5e6";
const SWAP_ID = "0b6b2a9e-3d4e-4c55-8f8e-6a1d2c3b4a59";
const PENDING_SWAP_ID = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const FAILED_SWAP_ID = "2d3e4f5a-6b7c-4d8e-9fa0-1b2c3d4e5f60";
const TX_HASH = "0x" + "ab".repeat(32);

/** The standard error body: the front-end picks the message shown to the user by `code`. */
const errorBody = (code: string, message: string) => ({ error: { code, message: like(message) } });

async function errorFrom(promise: Promise<unknown>) {
  const error = await promise.catch((err: unknown) => err);
  expect(error).to.be.instanceOf(ApiError);
  return error as ApiError;
}

const pact = new PactV4({
  consumer: "MiniDexWeb",
  provider: "MiniDexApi",
  dir: path.resolve("pacts"),
  logLevel: "warn",
});

describe("Contract (consumer): web/apiClient.js -> API", () => {
  it("gets a quote", async () => {
    await pact
      .addInteraction()
      .given("the price provider is available")
      .uponReceiving("a request for a TKA to TKB quote")
      .withRequest("GET", "/quotes", (builder) => {
        builder.query({ from: "TKA", to: "TKB", amount: "100" });
      })
      .willRespondWith(200, (builder) => {
        builder.jsonBody({
          quoteId: uuid(QUOTE_ID),
          from: "TKA",
          to: "TKB",
          amountIn: like("100.0"),
          amountOut: like("199.4"),
          fee: like("0.6"),
          feeBps: like(30),
          price: like(2),
          expiresAt: iso8601DateTimeWithMillis("2026-01-01T12:00:15.000Z"),
        });
      })
      .executeTest(async (mockServer) => {
        const quote = await createApiClient(mockServer.url).getQuote({ from: "TKA", to: "TKB", amount: "100" });

        expect(quote.quoteId).to.equal(QUOTE_ID);
        expect(quote.amountOut).to.equal("199.4");
        // All shown on screen next to the quote:
        expect(quote.price).to.equal(2);
        expect(quote.fee).to.equal("0.6");
        expect(quote.feeBps).to.equal(30);
      });
  });

  const PRICE_PROVIDER_FAILURES = [
    { state: "the price provider is down", description: "down", status: 503, code: "PRICE_PROVIDER_UNAVAILABLE" },
    { state: "the price provider is slow", description: "too slow", status: 504, code: "PRICE_PROVIDER_TIMEOUT" },
    { state: "the price provider sends invalid responses", description: "sending invalid responses", status: 502, code: "PRICE_PROVIDER_BAD_RESPONSE" },
  ];

  for (const failure of PRICE_PROVIDER_FAILURES) {
    it(`gets ${failure.status} ${failure.code} when the price provider is ${failure.description}`, async () => {
      await pact
        .addInteraction()
        .given(failure.state)
        .uponReceiving(`a request for a quote while the price provider is ${failure.description}`)
        .withRequest("GET", "/quotes", (builder) => {
          builder.query({ from: "TKA", to: "TKB", amount: "100" });
        })
        .willRespondWith(failure.status, (builder) => {
          builder.jsonBody(errorBody(failure.code, "Price provider failure"));
        })
        .executeTest(async (mockServer) => {
          const error = await errorFrom(createApiClient(mockServer.url).getQuote({ from: "TKA", to: "TKB", amount: "100" }));

          expect(error).to.include({ status: failure.status, code: failure.code });
        });
    });
  }

  it("gets 400 INVALID_REQUEST for an amount the API does not accept", async () => {
    // The front-end accepts any number of decimals; the API only 18 (the token precision).
    const amount = "0.0000000000000000001";
    await pact
      .addInteraction()
      .given("the price provider is available")
      .uponReceiving("a request for a quote with more than 18 decimals")
      .withRequest("GET", "/quotes", (builder) => {
        builder.query({ from: "TKA", to: "TKB", amount });
      })
      .willRespondWith(400, (builder) => {
        builder.jsonBody(errorBody("INVALID_REQUEST", "amount must be a positive decimal number"));
      })
      .executeTest(async (mockServer) => {
        const error = await errorFrom(createApiClient(mockServer.url).getQuote({ from: "TKA", to: "TKB", amount }));

        expect(error).to.include({ status: 400, code: "INVALID_REQUEST" });
      });
  });

  it("creates a swap from a valid quote", async () => {
    await pact
      .addInteraction()
      .given("a valid quote exists", { quoteId: QUOTE_ID })
      .uponReceiving("a request to swap using a valid quote")
      .withRequest("POST", "/swaps", (builder) => {
        builder.jsonBody({ quoteId: QUOTE_ID });
      })
      .willRespondWith(202, (builder) => {
        builder.jsonBody({
          swapId: uuid(SWAP_ID),
          txHash: regex(/^0x[0-9a-f]{64}$/, TX_HASH),
          status: "pending",
        });
      })
      .executeTest(async (mockServer) => {
        const swap = await createApiClient(mockServer.url).createSwap(QUOTE_ID);

        expect(swap).to.deep.equal({ swapId: SWAP_ID, txHash: TX_HASH, status: "pending" });
      });
  });

  it("gets 410 QUOTE_EXPIRED when swapping with an expired quote", async () => {
    await pact
      .addInteraction()
      .given("an expired quote exists", { quoteId: EXPIRED_QUOTE_ID })
      .uponReceiving("a request to swap using an expired quote")
      .withRequest("POST", "/swaps", (builder) => {
        builder.jsonBody({ quoteId: EXPIRED_QUOTE_ID });
      })
      .willRespondWith(410, (builder) => {
        builder.jsonBody(errorBody("QUOTE_EXPIRED", "Quote has expired, request a new one"));
      })
      .executeTest(async (mockServer) => {
        const error = await errorFrom(createApiClient(mockServer.url).createSwap(EXPIRED_QUOTE_ID));

        expect(error).to.include({ status: 410, code: "QUOTE_EXPIRED" });
      });
  });

  it("gets the balances of the trading account", async () => {
    await pact
      .addInteraction()
      .given("the trading account has balances")
      .uponReceiving("a request for the account balances")
      .withRequest("GET", "/balances")
      .willRespondWith(200, (builder) => {
        builder.jsonBody({
          account: regex(/^0x[0-9a-fA-F]{40}$/, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"),
          balances: { TKA: like("1000000.0"), TKB: like("1000000.0") },
        });
      })
      .executeTest(async (mockServer) => {
        const { balances } = await createApiClient(mockServer.url).getBalances();

        expect(balances).to.deep.equal({ TKA: "1000000.0", TKB: "1000000.0" });
      });
  });

  it("gets the status of a confirmed swap", async () => {
    await pact
      .addInteraction()
      .given("a confirmed swap exists", { swapId: SWAP_ID })
      .uponReceiving("a request for the status of a confirmed swap")
      .withRequest("GET", `/swaps/${SWAP_ID}`)
      .willRespondWith(200, (builder) => {
        builder.jsonBody({
          swapId: SWAP_ID,
          from: "TKA",
          to: "TKB",
          amountIn: like("100.0"),
          amountOut: like("199.4"),
          fee: like("0.6"),
          status: "confirmed",
          blockNumber: like(42),
          createdAt: iso8601DateTimeWithMillis("2026-01-01T12:00:00.000Z"),
        });
      })
      .executeTest(async (mockServer) => {
        const swap = await createApiClient(mockServer.url).getSwap(SWAP_ID);

        expect(swap).to.include({ status: "confirmed", amountOut: "199.4", fee: "0.6", blockNumber: 42 });
      });
  });

  it("gets the status of a pending swap", async () => {
    await pact
      .addInteraction()
      .given("a pending swap exists", { swapId: PENDING_SWAP_ID })
      .uponReceiving("a request for the status of a pending swap")
      .withRequest("GET", `/swaps/${PENDING_SWAP_ID}`)
      .willRespondWith(200, (builder) => {
        builder.jsonBody({ swapId: PENDING_SWAP_ID, status: "pending" });
      })
      .executeTest(async (mockServer) => {
        const swap = await createApiClient(mockServer.url).getSwap(PENDING_SWAP_ID);

        expect(swap.status).to.equal("pending"); // the front-end keeps polling
      });
  });

  it("gets the status and the reason of a failed swap", async () => {
    await pact
      .addInteraction()
      .given("a failed swap exists", { swapId: FAILED_SWAP_ID })
      .uponReceiving("a request for the status of a failed swap")
      .withRequest("GET", `/swaps/${FAILED_SWAP_ID}`)
      .willRespondWith(200, (builder) => {
        builder.jsonBody({
          swapId: FAILED_SWAP_ID,
          status: "failed",
          failure: {
            code: like("SLIPPAGE_EXCEEDED"),
            message: like("On-chain price moved: would receive 149.55, minimum accepted 197.406"),
          },
        });
      })
      .executeTest(async (mockServer) => {
        const swap = await createApiClient(mockServer.url).getSwap(FAILED_SWAP_ID);

        expect(swap.status).to.equal("failed");
        expect(swap.failure.message).to.be.a("string"); // shown on screen
      });
  });

  it("lists the swap history", async () => {
    await pact
      .addInteraction()
      .given("a swap exists in the history")
      .uponReceiving("a request for the swap history")
      .withRequest("GET", "/swaps")
      .willRespondWith(200, (builder) => {
        // Every row the front-end renders; amountOut is optional (a pending swap has none yet).
        builder.jsonBody({
          swaps: eachLike({
            swapId: uuid(SWAP_ID),
            from: like("TKA"),
            to: like("TKB"),
            amountIn: like("100.0"),
            status: like("confirmed"),
            createdAt: iso8601DateTimeWithMillis("2026-01-01T12:00:00.000Z"),
          }),
        });
      })
      .executeTest(async (mockServer) => {
        const swaps = await createApiClient(mockServer.url).listSwaps();

        expect(swaps).to.have.length(1);
        expect(swaps[0]).to.include({ from: "TKA", to: "TKB", amountIn: "100.0", status: "confirmed" });
      });
  });
});
