export type NonceStrategy = {
  name: "naive" | "managed";
  /** Picks a nonce and calls send with it. */
  withNonce<T>(send: (nonce: number) => Promise<T>): Promise<T>;
  /** Forgets any cached nonce (used after the chain is reset). */
  reset(): void;
};
