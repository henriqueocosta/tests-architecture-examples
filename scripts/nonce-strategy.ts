// Switches the API's nonce strategy at runtime. Usage: tsx scripts/nonce-strategy.ts naive|managed
const API_URL = process.env.API_URL ?? "http://127.0.0.1:3000";
const nonceStrategy = process.argv[2];

const response = await fetch(`${API_URL}/__control/nonce-strategy`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ nonceStrategy }),
});
console.log(`Nonce strategy: ${response.status}`, await response.json());
if (!response.ok) process.exit(1);
