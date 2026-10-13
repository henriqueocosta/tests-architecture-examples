// k6: each virtual user gets a quote, submits the swap and polls its status
// until it is confirmed. Configure with environment variables, e.g.
//   VUS=10 ITERATIONS=3 P95_CONFIRMATION_MS=2500 npm run perf
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const API_URL = __ENV.API_URL || "http://127.0.0.1:3000";
const VUS = Number(__ENV.VUS || 10);
const ITERATIONS = Number(__ENV.ITERATIONS || 3);
const P95_CONFIRMATION_MS = Number(__ENV.P95_CONFIRMATION_MS || 2500);
const CONFIRMATION_TIMEOUT_MS = 30000;
const POLL_INTERVAL_S = 0.25;

const swapErrorRate = new Rate("swap_error_rate"); // POST /swaps not answered with 202
// From the moment the user asks for the swap (before POST /swaps) until it is confirmed.
const timeToConfirmation = new Trend("time_to_confirmation", true);
// Time for the API to accept the swap: grows when submissions are serialized (managed nonces).
const swapSubmissionTime = new Trend("swap_submission_time", true);
const swapsNotConfirmed = new Counter("swaps_not_confirmed");

export const options = {
  scenarios: {
    swaps: { executor: "per-vu-iterations", vus: VUS, iterations: ITERATIONS, maxDuration: "3m" },
  },
  thresholds: {
    swap_error_rate: ["rate==0"],
    time_to_confirmation: [`p(95)<${P95_CONFIRMATION_MS}`],
    swaps_not_confirmed: ["count==0"],
  },
};

const JSON_HEADERS = { headers: { "Content-Type": "application/json" } };

export default function () {
  // Distinct amounts: identical requests would produce identical signed transactions.
  const amount = 1 + Math.floor(Math.random() * 100);

  const quote = http.get(`${API_URL}/quotes?from=TKA&to=TKB&amount=${amount}`, { tags: { name: "GET /quotes" } });
  if (!check(quote, { "quote 200": (r) => r.status === 200 })) return;

  const requestedAt = Date.now();
  const swap = http.post(`${API_URL}/swaps`, JSON.stringify({ quoteId: quote.json("quoteId") }), {
    ...JSON_HEADERS,
    tags: { name: "POST /swaps" },
  });
  const accepted = check(swap, { "swap 202": (r) => r.status === 202 });
  swapErrorRate.add(!accepted);
  if (!accepted) {
    console.warn(`POST /swaps ${swap.status}: ${swap.json("error.message")}`);
    return;
  }

  swapSubmissionTime.add(Date.now() - requestedAt);

  while (Date.now() - requestedAt < CONFIRMATION_TIMEOUT_MS) {
    sleep(POLL_INTERVAL_S); // pacing between status polls
    const status = http.get(`${API_URL}/swaps/${swap.json("swapId")}`, { tags: { name: "GET /swaps/:id" } }).json("status");
    if (status === "confirmed") {
      timeToConfirmation.add(Date.now() - requestedAt);
      return;
    }
    if (status === "failed") break;
  }
  swapsNotConfirmed.add(1);
}
