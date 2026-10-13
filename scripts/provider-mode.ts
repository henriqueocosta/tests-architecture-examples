// Switches the simulated price provider mode. Usage: tsx scripts/provider-mode.ts slow
const mode = process.argv[2];
const url = process.env.PRICE_PROVIDER_URL ?? "http://127.0.0.1:4001";

const response = await fetch(`${url}/__control`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ mode }),
});
console.log(`Price provider: ${response.status}`, await response.json());
if (!response.ok) process.exit(1);
