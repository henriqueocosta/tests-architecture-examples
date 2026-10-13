// Component tests for the swap lifecycle. The fake chain decides when a
// transaction is mined; the fake clock decides when a quote expires.
import { expect } from "chai";
import request from "supertest";
import { toUnits } from "../../api/src/amounts.ts";
import { createApp } from "../../api/src/app.ts";
import { createHttpPriceClient } from "../../api/src/priceClient.ts";
import { createFakeChainClient } from "../support/fakeChainClient.ts";
import { createFakeClock } from "../support/fakeClock.ts";
import { startFakePriceProvider } from "../support/fakePriceProvider.ts";
import { testConfig } from "../support/testConfig.ts";

describe("Swaps", () => {
  let priceProvider: Awaited<ReturnType<typeof startFakePriceProvider>>;
  let chain: ReturnType<typeof createFakeChainClient>;
  let clock: ReturnType<typeof createFakeClock>;
  let api: ReturnType<typeof createApp>;
  const config = testConfig({ quoteTtlMs: 15_000, slippageBps: 100 });

  before(async () => {
    priceProvider = await startFakePriceProvider();
  });
  after(() => priceProvider.close());

  beforeEach(() => {
    chain = createFakeChainClient();
    clock = createFakeClock();
    api = createApp({
      config,
      clock,
      priceClient: createHttpPriceClient({ baseUrl: priceProvider.url, timeoutMs: config.priceTimeoutMs }),
      chainClient: chain.client,
    });
  });

  async function createQuote(amount = "100") {
    const response = await request(api.app).get(`/quotes?from=TKA&to=TKB&amount=${amount}`).expect(200);
    return response.body.quoteId as string;
  }

  describe("POST /swaps", () => {
    it("submits the transaction with slippage protection and answers 202 pending", async () => {
      const quoteId = await createQuote("100");

      const response = await request(api.app).post("/swaps").send({ quoteId }).expect(202);

      expect(response.body).to.include({ status: "pending" });
      expect(response.body.swapId).to.be.a("string");
      expect(response.body.txHash).to.match(/^0x[0-9a-f]{64}$/);
      // Quote said 199.4 TKB (after the fee); with 1% tolerance the contract must revert below 197.406.
      expect(chain.sentSwaps).to.deep.equal([
        { from: "TKA", to: "TKB", amountIn: toUnits("100"), minAmountOut: toUnits("197.406") },
      ]);
    });

    it("returns 404 QUOTE_NOT_FOUND for an unknown quote", async () => {
      const response = await request(api.app).post("/swaps").send({ quoteId: "does-not-exist" }).expect(404);

      expect(response.body.error.code).to.equal("QUOTE_NOT_FOUND");
    });

    it("accepts a quote one millisecond before it expires", async () => {
      const quoteId = await createQuote();
      clock.advance(config.quoteTtlMs - 1);

      await request(api.app).post("/swaps").send({ quoteId }).expect(202);
    });

    it("returns 410 QUOTE_EXPIRED once the validity has passed", async () => {
      const quoteId = await createQuote();
      clock.advance(config.quoteTtlMs);

      const response = await request(api.app).post("/swaps").send({ quoteId }).expect(410);

      expect(response.body.error.code).to.equal("QUOTE_EXPIRED");
      expect(chain.sentSwaps).to.be.empty;
    });

    it("returns 500 TX_SUBMISSION_FAILED when the node rejects the transaction", async () => {
      const quoteId = await createQuote();
      chain.rejectNextSubmission(new Error("nonce too low"));

      const response = await request(api.app).post("/swaps").send({ quoteId }).expect(500);

      expect(response.body.error).to.deep.equal({ code: "TX_SUBMISSION_FAILED", message: "nonce too low" });
    });

    it("returns 400 INVALID_REQUEST without a quoteId", async () => {
      const response = await request(api.app).post("/swaps").send({}).expect(400);

      expect(response.body.error.code).to.equal("INVALID_REQUEST");
    });
  });

  describe("GET /swaps/:id", () => {
    it("stays pending until the indexer sees the Swapped event, then is confirmed", async () => {
      const { body: submitted } = await request(api.app).post("/swaps").send({ quoteId: await createQuote("100") });

      await api.indexer.poll();
      expect((await request(api.app).get(`/swaps/${submitted.swapId}`)).body.status).to.equal("pending");

      chain.confirm(submitted.txHash, toUnits("199.4"), toUnits("0.6"));
      await api.indexer.poll();

      const { body: swap } = await request(api.app).get(`/swaps/${submitted.swapId}`).expect(200);
      expect(swap).to.include({ status: "confirmed", amountOut: "199.4", fee: "0.6", blockNumber: 1 });
    });

    it("is failed, with the reason, when the transaction reverts", async () => {
      const { body: submitted } = await request(api.app).post("/swaps").send({ quoteId: await createQuote() });

      chain.revert(submitted.txHash, { code: "SLIPPAGE_EXCEEDED", message: "price moved" });

      const { body: swap } = await request(api.app).get(`/swaps/${submitted.swapId}`).expect(200);
      expect(swap.status).to.equal("failed");
      expect(swap.failure).to.deep.equal({ code: "SLIPPAGE_EXCEEDED", message: "price moved" });
    });

    it("returns 404 SWAP_NOT_FOUND for an unknown swap", async () => {
      const response = await request(api.app).get("/swaps/unknown").expect(404);

      expect(response.body.error.code).to.equal("SWAP_NOT_FOUND");
    });
  });

  describe("GET /swaps", () => {
    it("lists the history, newest first", async () => {
      const first = (await request(api.app).post("/swaps").send({ quoteId: await createQuote("1") })).body;
      const second = (await request(api.app).post("/swaps").send({ quoteId: await createQuote("2") })).body;

      const { body } = await request(api.app).get("/swaps").expect(200);

      expect(body.swaps.map((s: any) => s.swapId)).to.deep.equal([second.swapId, first.swapId]);
    });
  });
});
