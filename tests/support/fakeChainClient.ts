// In-memory stand-in for the blockchain. The test decides when a swap is
// "mined" (confirmed or reverted) and whether a submission is rejected.
import { toUnits } from "../../api/src/amounts.ts";
import type { ChainClient, SwapFailure, SwapRequest, SwappedEvent, TokenSymbol } from "../../api/src/ports.ts";

export const FAKE_ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

export function createFakeChainClient() {
  const sentSwaps: SwapRequest[] = [];
  const events: SwappedEvent[] = [];
  const pendingOutcomes = new Map<string, (failure: SwapFailure | null) => void>();
  let blockNumber = 0;
  let nextSubmissionError: Error | undefined;
  let nonceStrategy: "naive" | "managed" = "naive";
  let feeBps = 30;
  let balances: Record<TokenSymbol, bigint> = { TKA: toUnits("1000"), TKB: toUnits("500") };

  const client: ChainClient = {
    async sendSwap(request) {
      if (nextSubmissionError) {
        const err = nextSubmissionError;
        nextSubmissionError = undefined;
        throw err;
      }
      sentSwaps.push(request);
      return `0x${sentSwaps.length.toString(16).padStart(64, "0")}`;
    },
    waitForFailure(txHash) {
      return new Promise((resolve) => pendingOutcomes.set(txHash, resolve));
    },
    async getBlockNumber() {
      return blockNumber;
    },
    async getSwappedEvents(fromBlock, toBlock) {
      return events.filter((e) => e.blockNumber >= fromBlock && e.blockNumber <= toBlock);
    },
    async getFeeBps() {
      return feeBps;
    },
    async getBalances() {
      return { account: FAKE_ACCOUNT, balances };
    },
    getNonceStrategy: () => nonceStrategy,
    setNonceStrategy(name) {
      nonceStrategy = name;
    },
  };

  return {
    client,
    sentSwaps,
    /** Mines a block containing a successful swap (emits Swapped). */
    confirm(txHash: string, amountOut: bigint, fee = 0n) {
      blockNumber++;
      events.push({ txHash, logIndex: 0, blockNumber, amountOut, fee });
      pendingOutcomes.get(txHash)?.(null);
    },
    /** Mines a block in which the swap reverted. */
    revert(txHash: string, failure: SwapFailure) {
      blockNumber++;
      pendingOutcomes.get(txHash)?.(failure);
    },
    setFeeBps(newFeeBps: number) {
      feeBps = newFeeBps;
    },
    setBalances(newBalances: Record<TokenSymbol, bigint>) {
      balances = newBalances;
    },
    rejectNextSubmission(error: Error) {
      nextSubmissionError = error;
    },
  };
}
