// Mocks the API for UI tests. Each route can be overridden per test.
import type { Page, Route } from "@playwright/test";

export const QUOTE = {
  quoteId: "quote-1",
  from: "TKA",
  to: "TKB",
  amountIn: "100.0",
  amountOut: "199.4",
  fee: "0.6",
  feeBps: 30,
  price: 2,
};

type Handler = (route: Route) => Promise<void>;

export const json = (status: number, body: unknown): Handler => (route) => route.fulfill({ status, json: body });

export async function mockApi(
  page: Page,
  handlers: { quotes?: Handler; createSwap?: Handler; getSwap?: Handler; listSwaps?: Handler; balances?: Handler } = {},
) {
  await page.route(
    (url) => url.pathname === "/quotes",
    handlers.quotes ?? json(200, { ...QUOTE, expiresAt: new Date(Date.now() + 15_000).toISOString() }),
  );
  await page.route(
    (url) => url.pathname === "/swaps",
    (route) =>
      route.request().method() === "POST"
        ? (handlers.createSwap ?? json(202, { swapId: "swap-1", txHash: "0xabc", status: "pending" }))(route)
        : (handlers.listSwaps ?? json(200, { swaps: [] }))(route),
  );
  await page.route((url) => url.pathname.startsWith("/swaps/"), handlers.getSwap ?? json(200, pendingSwap()));
  await page.route((url) => url.pathname === "/balances", handlers.balances ?? json(200, balances("1000.0", "500.0")));
}

export function balances(TKA: string, TKB: string) {
  return { account: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", balances: { TKA, TKB } };
}

export function pendingSwap() {
  return {
    swapId: "swap-1",
    from: "TKA",
    to: "TKB",
    amountIn: "100.0",
    expectedAmountOut: "200.0",
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}
