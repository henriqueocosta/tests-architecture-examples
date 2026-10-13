// Asynchronous integration tests against the running stack (npm run dev):
// real blockchain with interval mining, real indexer, real price provider.
import { expect } from "chai";
import { setRate } from "../../shared/miniSwapAdmin.ts";
import { api, assertStackIsRunning, getSwap, indexerStatus, submitSwap } from "./stack.ts";
import { waitFor } from "./waitFor.ts";

const CONFIRMATION_TIMEOUT_MS = 10_000; // ~3 blocks at the default 3 s interval

function waitForSwapToSettle(swapId: string) {
  return waitFor(() => getSwap(swapId), {
    until: (swap) => swap.status !== "pending",
    timeoutMs: CONFIRMATION_TIMEOUT_MS,
    description: `swap ${swapId} to leave "pending"`,
    diagnose: async () => {
      const indexer = await indexerStatus();
      const hint = indexer.paused ? "\nThe indexer is PAUSED: nothing will be confirmed. Run: npm run indexer:resume" : "";
      return `Indexer status: ${JSON.stringify(indexer)}${hint}`;
    },
  });
}

describe("Swaps against the running stack", function () {
  this.timeout(30_000);

  before(assertStackIsRunning);

  it("confirms a swap asynchronously: 202 pending, then confirmed by the indexer", async () => {
    const submitted = await submitSwap("10");
    expect(submitted.status).to.equal("pending");

    const swap = await waitForSwapToSettle(submitted.swapId);

    expect(swap.status).to.equal("confirmed");
    expect(swap.amountOut).to.equal("19.94"); // 10 TKA x 2, minus the 0.3% fee
    expect(swap.fee).to.equal("0.06");
    expect(swap.blockNumber).to.be.a("number");
  });

  it("is idempotent: replaying the events does not duplicate anything", async () => {
    const submitted = await submitSwap("5");
    const swap = await waitForSwapToSettle(submitted.swapId);
    expect(swap.status).to.equal("confirmed");

    const indexerBefore = await indexerStatus();
    const historyBefore = (await api("GET", "/swaps")).body.swaps;

    const replay = await api("POST", "/__control/indexer/replay", { fromBlock: swap.blockNumber });

    expect(replay.status).to.equal(200);
    expect(replay.body.eventsFound).to.be.at.least(1);
    expect(replay.body.duplicatesSkipped).to.equal(replay.body.eventsFound);
    expect((await indexerStatus()).eventsIndexed).to.equal(indexerBefore.eventsIndexed);
    expect((await api("GET", "/swaps")).body.swaps).to.deep.equal(historyBefore);
  });

  describe("when the on-chain rate moves after the quote", () => {
    before(() => setRate("1.5")); // the provider still quotes 2.0
    after(() => setRate("2"));

    it("fails the swap with SLIPPAGE_EXCEEDED", async () => {
      const submitted = await submitSwap("10");
      expect(submitted.status).to.equal("pending"); // the revert only happens when the block is mined

      const swap = await waitForSwapToSettle(submitted.swapId);

      expect(swap.status).to.equal("failed");
      expect(swap.failure.code).to.equal("SLIPPAGE_EXCEEDED");
    });
  });
});
