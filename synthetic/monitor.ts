// Synthetic monitoring: every N seconds, exercise /health and /quotes like a
// user would and print one line: OK or ALERTA, with latency and reason.
// Runs until interrupted (Ctrl+C).
const API_URL = process.env.API_URL ?? "http://127.0.0.1:3000";
const INTERVAL_S = Number(process.env.SYNTHETIC_INTERVAL_S ?? 5);
const MAX_LATENCY_MS = Number(process.env.SYNTHETIC_MAX_LATENCY_MS ?? 1000);
const REQUEST_TIMEOUT_MS = 5000;

type CheckResult = { name: string; ok: boolean; latencyMs: number; reason?: string };

async function probe(name: string, path: string, isValid: (body: any) => boolean): Promise<CheckResult> {
  const startedAt = performance.now();
  const latency = () => Math.round(performance.now() - startedAt);
  try {
    const response = await fetch(API_URL + path, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const body = await response.json().catch(() => null);
    const latencyMs = latency();
    if (!response.ok) {
      return { name, ok: false, latencyMs, reason: `HTTP ${response.status} ${body?.error?.code ?? ""}`.trim() };
    }
    if (!isValid(body)) return { name, ok: false, latencyMs, reason: "unexpected response body" };
    if (latencyMs > MAX_LATENCY_MS) return { name, ok: false, latencyMs, reason: `slower than ${MAX_LATENCY_MS} ms` };
    return { name, ok: true, latencyMs };
  } catch (err: any) {
    const reason = err.name === "TimeoutError" ? `no answer within ${REQUEST_TIMEOUT_MS} ms` : `unreachable (${err.cause?.code ?? err.message})`;
    return { name, ok: false, latencyMs: latency(), reason };
  }
}

async function runChecks() {
  const time = new Date().toLocaleTimeString("pt-BR");
  const results = [
    await probe("health", "/health", (body) => body?.status === "ok"),
    await probe("quotes", "/quotes?from=TKA&to=TKB&amount=1", (body) => typeof body?.quoteId === "string"),
  ];
  const ok = results.every((r) => r.ok);
  const details = results
    .map((r) => `${r.name} ${r.latencyMs} ms${r.ok ? "" : ` (${r.reason})`}`)
    .join(" | ");
  console.log(`${time}  ${ok ? "OK    " : "ALERTA"}  ${details}`);
}

console.log(`Monitoramento sintético de ${API_URL} a cada ${INTERVAL_S} s (limite de latência: ${MAX_LATENCY_MS} ms). Ctrl+C para parar.`);
// One round at a time: a slow round delays the next one instead of overlapping it.
while (true) {
  await runChecks();
  await new Promise((resolve) => setTimeout(resolve, INTERVAL_S * 1000));
}
