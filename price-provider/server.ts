// Simulated external price provider. Its behavior can be switched at runtime
// through POST /__control to reproduce the failures shown in the demos.
import express from "express";

type Mode = "normal" | "slow" | "down" | "rate_limited" | "malformed";
const MODES: Mode[] = ["normal", "slow", "down", "rate_limited", "malformed"];

const PORT = Number(process.env.PRICE_PROVIDER_PORT ?? 4001);
const DEFAULT_SLOW_DELAY_MS = Number(process.env.PRICE_PROVIDER_SLOW_DELAY_MS ?? 5000);

// Reference prices. They match the MiniSwap on-chain rate (1 TKA = 2 TKB).
const PRICES: Record<string, number> = {
  "TKA-TKB": 2,
  "TKB-TKA": 0.5,
};

// Real prices move: each answer varies randomly around the reference price.
// The default ±0.5% stays inside the API's 1% slippage tolerance, so swaps never
// fail because of it. PRICE_PROVIDER_VARIATION=0 gives a fixed price.
const VARIATION = Number(process.env.PRICE_PROVIDER_VARIATION ?? 0.005);

function currentPrice(reference: number): number {
  const factor = 1 + (Math.random() * 2 - 1) * VARIATION;
  return Number((reference * factor).toFixed(4));
}

const state = { mode: "normal" as Mode, delayMs: DEFAULT_SLOW_DELAY_MS };

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/price", async (req, res) => {
  const pair = String(req.query.pair ?? "");

  switch (state.mode) {
    case "down":
      res.status(500).json({ error: "internal error" });
      return;
    case "rate_limited":
      res.status(429).set("Retry-After", "10").json({ error: "too many requests" });
      return;
    case "malformed":
      res.type("application/json").send('{"pair": "' + pair + '", "price": "not-a-number"');
      return;
    case "slow":
      await new Promise((resolve) => setTimeout(resolve, state.delayMs));
      break;
  }

  if (!(pair in PRICES)) {
    res.status(404).json({ error: `unknown pair ${pair}` });
    return;
  }
  res.json({ pair, price: currentPrice(PRICES[pair]), timestamp: new Date().toISOString() });
});

app.get("/__control", (_req, res) => {
  res.json(state);
});

app.post("/__control", (req, res) => {
  const { mode, delayMs } = req.body ?? {};
  if (!MODES.includes(mode)) {
    res.status(400).json({ error: `mode must be one of: ${MODES.join(", ")}` });
    return;
  }
  state.mode = mode;
  state.delayMs = Number(delayMs ?? DEFAULT_SLOW_DELAY_MS);
  console.log(`[price-provider] mode=${state.mode}` + (mode === "slow" ? ` delayMs=${state.delayMs}` : ""));
  res.json(state);
});

app.listen(PORT, () => {
  console.log(`[price-provider] listening on http://127.0.0.1:${PORT} (mode=${state.mode}, variation=±${VARIATION * 100}%)`);
});
