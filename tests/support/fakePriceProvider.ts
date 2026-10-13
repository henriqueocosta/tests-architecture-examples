// A fake price provider that speaks real HTTP on a random local port.
// Faking at the network boundary means the API's real HTTP client, with its
// timeout and error handling, is exercised by the tests.
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express, { type RequestHandler } from "express";

const PRICES: Record<string, number> = { "TKA-TKB": 2, "TKB-TKA": 0.5 };

export const behaviors = {
  normal: ((req, res) => {
    const pair = String(req.query.pair);
    res.json({ pair, price: PRICES[pair], timestamp: new Date().toISOString() });
  }) as RequestHandler,
  slow: (delayMs: number): RequestHandler => (req, res, next) => {
    setTimeout(() => behaviors.normal(req, res, next), delayMs);
  },
  down: ((_req, res) => {
    res.status(500).json({ error: "internal error" });
  }) as RequestHandler,
  rateLimited: ((_req, res) => {
    res.status(429).json({ error: "too many requests" });
  }) as RequestHandler,
  invalidJson: ((_req, res) => {
    res.type("application/json").send('{"price": ');
  }) as RequestHandler,
  missingPrice: ((req, res) => {
    res.json({ pair: req.query.pair, timestamp: new Date().toISOString() });
  }) as RequestHandler,
};

export async function startFakePriceProvider() {
  let behavior: RequestHandler = behaviors.normal;
  const app = express();
  app.get("/price", (req, res, next) => behavior(req, res, next));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    respondWith(newBehavior: RequestHandler) {
      behavior = newBehavior;
    },
    async close() {
      server.closeAllConnections();
      server.close();
    },
  };
}
