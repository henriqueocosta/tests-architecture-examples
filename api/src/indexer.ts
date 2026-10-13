// Follows Swapped events on-chain and marks the matching swaps as confirmed.
// Idempotent: each event is identified by txHash + logIndex and applied once.
import { fromUnits } from "./amounts.ts";
import type { Logger } from "./logger.ts";
import type { ChainClient, SwappedEvent } from "./ports.ts";
import type { Store } from "./store.ts";

export function createIndexer({
  chainClient,
  store,
  log,
  startBlock,
  pollMs,
}: {
  chainClient: ChainClient;
  store: Store;
  log: Logger;
  startBlock: number;
  pollMs: number;
}) {
  const processedEvents = new Set<string>();
  let lastProcessedBlock = startBlock;
  let paused = false;
  let duplicatesSkipped = 0;
  let timer: NodeJS.Timeout | undefined;
  let running = false;

  function apply(event: SwappedEvent) {
    const key = `${event.txHash}:${event.logIndex}`;
    if (processedEvents.has(key)) {
      duplicatesSkipped++;
      log.info("indexer skipped duplicate event", { eventKey: key });
      return;
    }
    processedEvents.add(key);

    const swap = store.findSwapByTxHash(event.txHash);
    if (!swap) return; // a swap not made through this API
    swap.status = "confirmed";
    swap.blockNumber = event.blockNumber;
    swap.amountOut = fromUnits(event.amountOut);
    swap.fee = fromUnits(event.fee);
    swap.confirmedAt = new Date().toISOString();
    log.info("swap confirmed", { correlationId: swap.correlationId, swapId: swap.swapId, block: event.blockNumber });
  }

  /** Processes the blocks mined since the last run. */
  async function poll() {
    if (paused || running) return;
    running = true;
    try {
      const latest = await chainClient.getBlockNumber();
      if (latest > lastProcessedBlock) {
        const events = await chainClient.getSwappedEvents(lastProcessedBlock + 1, latest);
        events.forEach(apply);
        lastProcessedBlock = latest;
      }
    } catch (err: any) {
      log.warn("indexer poll failed", { reason: err.message });
    } finally {
      running = false;
    }
  }

  return {
    poll,

    start() {
      timer = setInterval(poll, pollMs);
    },
    stop() {
      clearInterval(timer);
    },

    setPaused(value: boolean) {
      paused = value;
      log.info(paused ? "indexer paused" : "indexer resumed");
    },

    /** Re-reads events from fromBlock on. Already processed events are skipped. */
    async replay(fromBlock: number) {
      const toBlock = await chainClient.getBlockNumber();
      const events = await chainClient.getSwappedEvents(fromBlock, toBlock);
      const skippedBefore = duplicatesSkipped;
      events.forEach(apply);
      return { fromBlock, toBlock, eventsFound: events.length, duplicatesSkipped: duplicatesSkipped - skippedBefore };
    },

    reset() {
      processedEvents.clear();
      lastProcessedBlock = startBlock;
      duplicatesSkipped = 0;
      paused = false;
    },

    status: () => ({
      paused,
      lastProcessedBlock,
      eventsIndexed: processedEvents.size,
      duplicatesSkipped,
    }),
  };
}

export type Indexer = ReturnType<typeof createIndexer>;
