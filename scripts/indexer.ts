// Controls the indexer inside the API. Usage:
//   tsx scripts/indexer.ts pause | resume | status | replay [fromBlock]
const API_URL = process.env.API_URL ?? "http://127.0.0.1:3000";
const [command, fromBlock = "0"] = process.argv.slice(2);

async function call(method: string, path: string, body?: object) {
  const response = await fetch(API_URL + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  console.log(`Indexer ${command}: ${response.status}`, await response.json());
  if (!response.ok) process.exit(1);
}

switch (command) {
  case "pause":
    await call("POST", "/__control/indexer", { paused: true });
    break;
  case "resume":
    await call("POST", "/__control/indexer", { paused: false });
    break;
  case "replay":
    await call("POST", "/__control/indexer/replay", { fromBlock: Number(fromBlock) });
    break;
  case "status":
    await call("GET", "/__control/indexer");
    break;
  default:
    console.error("Usage: tsx scripts/indexer.ts pause | resume | status | replay [fromBlock]");
    process.exit(1);
}
