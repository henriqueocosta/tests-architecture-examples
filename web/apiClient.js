// The only module in the front-end that talks HTTP. The Pact consumer test
// imports this same file, so the contract is checked against real front-end code.

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createApiClient(baseUrl = "") {
  async function request(method, path, body) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: body ? { Accept: "application/json", "Content-Type": "application/json" } : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(
        response.status,
        data?.error?.code ?? "UNKNOWN_ERROR",
        data?.error?.message ?? `HTTP ${response.status}`,
      );
    }
    return data;
  }

  return {
    getQuote: ({ from, to, amount }) => request("GET", `/quotes?${new URLSearchParams({ from, to, amount })}`),
    createSwap: (quoteId) => request("POST", "/swaps", { quoteId }),
    getSwap: (swapId) => request("GET", `/swaps/${encodeURIComponent(swapId)}`),
    listSwaps: async () => (await request("GET", "/swaps")).swaps,
    getBalances: () => request("GET", "/balances"),
  };
}
