import type { Wallet } from "ethers";
import type { NonceStrategy } from "./nonceStrategy.ts";

/**
 * Keeps the next nonce in memory and lets only one transaction be signed and
 * sent at a time. No collisions, at the cost of serializing submissions.
 */
export function createManagedNonce(wallet: Wallet): NonceStrategy {
  let nextNonce: number | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  return {
    name: "managed",
    withNonce(send) {
      const run = queue.then(async () => {
        nextNonce ??= await wallet.getNonce("pending");
        try {
          const result = await send(nextNonce);
          nextNonce++;
          return result;
        } catch (err) {
          nextNonce = undefined; // re-read from the node on the next transaction
          throw err;
        }
      });
      queue = run.catch(() => {});
      return run;
    },
    reset() {
      nextNonce = undefined;
    },
  };
}
