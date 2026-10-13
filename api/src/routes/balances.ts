import { Router } from "express";
import { fromUnits } from "../amounts.ts";
import type { ChainClient } from "../ports.ts";

export function balancesRouter({ chainClient }: { chainClient: ChainClient }) {
  const router = Router();

  // Read on-chain: only changes when a block with a confirmed swap is mined.
  router.get("/balances", async (_req, res) => {
    const { account, balances } = await chainClient.getBalances();
    res.json({ account, balances: { TKA: fromUnits(balances.TKA), TKB: fromUnits(balances.TKB) } });
  });

  return router;
}
