// Small HTTP helpers for tests that run against the stack started by `npm run dev`.
export const API_URL = process.env.API_URL ?? "http://127.0.0.1:3000";

export async function api(method: string, path: string, body?: object) {
  const response = await fetch(API_URL + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

export async function assertStackIsRunning() {
  try {
    await fetch(`${API_URL}/health`);
  } catch {
    throw new Error(`The stack is not running at ${API_URL}. Start it with: npm run dev`);
  }
}

/** Creates a quote and submits the swap. Returns the 202 body. */
export async function submitSwap(amount: string) {
  const quote = await api("GET", `/quotes?from=TKA&to=TKB&amount=${amount}`);
  if (quote.status !== 200) throw new Error(`Quote failed: ${quote.status} ${JSON.stringify(quote.body)}`);
  const swap = await api("POST", "/swaps", { quoteId: quote.body.quoteId });
  if (swap.status !== 202) throw new Error(`Swap failed: ${swap.status} ${JSON.stringify(swap.body)}`);
  return swap.body as { swapId: string; txHash: string; status: string };
}

export async function getSwap(swapId: string) {
  return (await api("GET", `/swaps/${swapId}`)).body;
}

export async function indexerStatus() {
  return (await api("GET", "/__control/indexer")).body;
}
