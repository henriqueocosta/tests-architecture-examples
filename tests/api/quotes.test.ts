// Component tests for GET /quotes: the API runs in-process, the price
// provider is a fake HTTP server and the blockchain is an in-memory fake.
import { expect } from "chai";
import request from "supertest";
import { createApp } from "../../api/src/app.ts";
import { createHttpPriceClient } from "../../api/src/priceClient.ts";
import { createFakeChainClient } from "../support/fakeChainClient.ts";
import { createFakeClock } from "../support/fakeClock.ts";
import { behaviors, startFakePriceProvider } from "../support/fakePriceProvider.ts";
import { testConfig } from "../support/testConfig.ts";

describe("GET /quotes", () => {
  let priceProvider: Awaited<ReturnType<typeof startFakePriceProvider>>;
  let app: ReturnType<typeof createApp>["app"];
  let chain: ReturnType<typeof createFakeChainClient>;
  const clock = createFakeClock();
  const config = testConfig({ priceTimeoutMs: 200, quoteTtlMs: 15_000 });

  before(async () => {
    priceProvider = await startFakePriceProvider();
    ({ app } = createApp({
      config,
      clock,
      priceClient: createHttpPriceClient({ baseUrl: priceProvider.url, timeoutMs: config.priceTimeoutMs }),
      chainClient: (chain = createFakeChainClient()).client,
    }));
  });

  beforeEach(() => {
    priceProvider.respondWith(behaviors.normal);
    chain.setFeeBps(30);
  });
  after(() => priceProvider.close());

  it("returns a quote priced by the provider, net of the 0.3% fee, valid for the configured time", async () => {
    const response = await request(app).get("/quotes?from=TKA&to=TKB&amount=100").expect(200);

    // 100 TKA x 2 = 200 TKB, minus 0.3% (0.6 TKB)
    expect(response.body).to.include({
      from: "TKA",
      to: "TKB",
      amountIn: "100.0",
      amountOut: "199.4",
      fee: "0.6",
      feeBps: 30,
      price: 2,
    });
    expect(response.body.quoteId).to.be.a("string");
    expect(response.body.expiresAt).to.equal(new Date(clock.now() + 15_000).toISOString());
  });

  it("uses the fee currently configured in the contract", async () => {
    chain.setFeeBps(100); // 1%

    const response = await request(app).get("/quotes?from=TKA&to=TKB&amount=100").expect(200);

    expect(response.body).to.include({ amountOut: "198.0", fee: "2.0", feeBps: 100 });
  });

  it("returns 504 PRICE_PROVIDER_TIMEOUT when the provider is slower than the timeout", async () => {
    priceProvider.respondWith(behaviors.slow(config.priceTimeoutMs + 300));

    const response = await request(app).get("/quotes?from=TKA&to=TKB&amount=100").expect(504);

    expect(response.body.error.code).to.equal("PRICE_PROVIDER_TIMEOUT");
  });

  it("returns 503 PRICE_PROVIDER_UNAVAILABLE when the provider is down (500)", async () => {
    priceProvider.respondWith(behaviors.down);

    const response = await request(app).get("/quotes?from=TKA&to=TKB&amount=100").expect(503);

    expect(response.body.error.code).to.equal("PRICE_PROVIDER_UNAVAILABLE");
  });

  it("returns 503 PRICE_PROVIDER_UNAVAILABLE when the provider rate limits us (429)", async () => {
    priceProvider.respondWith(behaviors.rateLimited);

    const response = await request(app).get("/quotes?from=TKA&to=TKB&amount=100").expect(503);

    expect(response.body.error.code).to.equal("PRICE_PROVIDER_UNAVAILABLE");
  });

  it("returns 502 PRICE_PROVIDER_BAD_RESPONSE when the provider sends invalid JSON", async () => {
    priceProvider.respondWith(behaviors.invalidJson);

    const response = await request(app).get("/quotes?from=TKA&to=TKB&amount=100").expect(502);

    expect(response.body.error.code).to.equal("PRICE_PROVIDER_BAD_RESPONSE");
  });

  it("returns 502 PRICE_PROVIDER_BAD_RESPONSE when the provider response has no price", async () => {
    priceProvider.respondWith(behaviors.missingPrice);

    const response = await request(app).get("/quotes?from=TKA&to=TKB&amount=100").expect(502);

    expect(response.body.error.code).to.equal("PRICE_PROVIDER_BAD_RESPONSE");
  });

  for (const query of ["from=TKA&to=TKA&amount=1", "from=TKA&to=XYZ&amount=1", "from=TKA&to=TKB&amount=-5", "from=TKA&to=TKB"]) {
    it(`returns 400 INVALID_REQUEST for ?${query}`, async () => {
      const response = await request(app).get(`/quotes?${query}`).expect(400);

      expect(response.body).to.deep.equal({ error: { code: "INVALID_REQUEST", message: response.body.error.message } });
    });
  }

  it("returns the caller's correlation ID", async () => {
    const response = await request(app)
      .get("/quotes?from=TKA&to=TKB&amount=1")
      .set("x-correlation-id", "demo-123")
      .expect(200);

    expect(response.headers["x-correlation-id"]).to.equal("demo-123");
  });
});
