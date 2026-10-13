// Changes the on-chain MiniSwap rate. Usage: tsx scripts/set-rate.ts 1.5
import { setRate } from "../shared/miniSwapAdmin.ts";

const newRate = process.argv[2] ?? "1.5";
console.log(`Sending setRate(${newRate}), waiting for the next block...`);
const { before, after } = await setRate(newRate);
console.log(`MiniSwap rate: ${before} -> ${after} TKB per TKA`);
