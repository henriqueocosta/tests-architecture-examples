// HTTP client for the external price provider. Every failure becomes a
// PriceProviderError, which the API maps to 502/503/504.
import { PriceProviderError } from "./errors.ts";
import type { PriceClient } from "./ports.ts";

export function createHttpPriceClient({ baseUrl, timeoutMs }: { baseUrl: string; timeoutMs: number }): PriceClient {
  return {
    async getPrice(pair) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/price?pair=${encodeURIComponent(pair)}`, {
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err: any) {
        if (err.name === "TimeoutError") {
          throw new PriceProviderError("timeout", `Price provider did not answer within ${timeoutMs} ms`);
        }
        throw new PriceProviderError("unavailable", `Price provider unreachable: ${err.message}`);
      }

      if (response.status === 429) {
        throw new PriceProviderError("unavailable", "Price provider is rate limiting us (429)");
      }
      if (!response.ok) {
        throw new PriceProviderError("unavailable", `Price provider answered ${response.status}`);
      }

      let body: any;
      try {
        body = await response.json();
      } catch {
        throw new PriceProviderError("bad_response", "Price provider sent invalid JSON");
      }
      if (typeof body?.price !== "number" || !(body.price > 0)) {
        throw new PriceProviderError("bad_response", "Price provider sent a response without a valid price");
      }
      return { pair: body.pair, price: body.price, timestamp: body.timestamp };
    },
  };
}
