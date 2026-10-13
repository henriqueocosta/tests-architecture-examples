import { expect } from "chai";
import request from "supertest";
import { toUnits } from "../../api/src/amounts.ts";
import { createApp } from "../../api/src/app.ts";
import { FAKE_ACCOUNT, createFakeChainClient } from "../support/fakeChainClient.ts";
import { createFakeClock } from "../support/fakeClock.ts";
import { testConfig } from "../support/testConfig.ts";

describe("GET /balances", () => {
  it("returns the on-chain balances of the trading account as decimal strings", async () => {
    const chain = createFakeChainClient();
    chain.setBalances({ TKA: toUnits("999900"), TKB: toUnits("1000200.5") });
    const { app } = createApp({
      config: testConfig(),
      clock: createFakeClock(),
      priceClient: { getPrice: async () => ({ pair: "TKA-TKB", price: 2, timestamp: "" }) },
      chainClient: chain.client,
    });

    const response = await request(app).get("/balances").expect(200);

    expect(response.body).to.deep.equal({
      account: FAKE_ACCOUNT,
      balances: { TKA: "999900.0", TKB: "1000200.5" },
    });
  });
});
