import type { Wallet } from "ethers";
import type { NonceStrategy } from "./nonceStrategy.ts";

/**
 * Asks the node for the next nonce on every transaction, like a
 * straightforward implementation would. Two concurrent requests can read
 * the same nonce before either transaction reaches the node: one of them
 * is then rejected.
 */
export function createNaiveNonce(wallet: Wallet): NonceStrategy {
  return {
    name: "naive",
    async withNonce(send) {
      const nonce = await wallet.getNonce("pending");
      return send(nonce);
    },
    reset() {},
  };
}
