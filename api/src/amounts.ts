// Token amounts travel as decimal strings in the API ("100.5") and as
// bigint with 18 decimals inside the system and on-chain.
import { formatUnits, parseUnits } from "ethers";

const DECIMALS = 18;
const ONE = 10n ** 18n;

export const toUnits = (value: string | number): bigint => parseUnits(String(value), DECIMALS);
export const fromUnits = (value: bigint): string => formatUnits(value, DECIMALS);

export function convert(amountIn: bigint, price: number): bigint {
  return (amountIn * toUnits(price)) / ONE;
}

/** Same arithmetic as MiniSwap.quote: the fee is deducted from the amount out. */
export function deductFee(grossAmountOut: bigint, feeBps: number): { amountOut: bigint; fee: bigint } {
  const fee = (grossAmountOut * BigInt(feeBps)) / 10_000n;
  return { amountOut: grossAmountOut - fee, fee };
}

export function applySlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}
