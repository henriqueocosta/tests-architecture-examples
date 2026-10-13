// End-to-end: real browser, real API, real price provider, real blockchain.
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { formatUnits, parseUnits } from "ethers";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test("quote, swap and see the swap confirmed in the history", async ({ page }) => {
  // A distinct amount identifies this test's row in a history shared with other runs.
  const amount = String(1000 + Math.floor(Math.random() * 9000));

  await page.goto("/");
  await expect(page.getByTestId("token-from")).toHaveText("TKA");
  await expect(page.getByTestId("balance-from")).not.toHaveText("—");
  const tkaBefore = parseUnits((await page.getByTestId("balance-from").textContent())!, 18);
  const tkbBefore = parseUnits((await page.getByTestId("balance-to").textContent())!, 18);
  // What the contract pays: on-chain rate 2, minus the 0.3% fee (the same integer arithmetic as the contract).
  const received = (parseUnits(amount, 18) * 2n * 9970n) / 10000n;

  await page.getByLabel("Valor a enviar").fill(amount);
  await page.getByRole("button", { name: "Cotar" }).click();
  await expect(page.getByTestId("quote-panel")).toBeVisible();
  // The quote is an estimate: the provider price varies up to ±0.5% around the on-chain rate.
  const quoted = parseUnits((await page.getByTestId("quote-amount-out").textContent())!, 18);
  const difference = quoted > received ? quoted - received : received - quoted;
  expect(difference <= (received * 5n) / 1000n).toBe(true);

  await page.getByRole("button", { name: "Swap" }).click();
  await expect(page.getByTestId("swap-status")).toContainText("Swap pendente");

  // Blocks are mined every 3 s: allow for a few of them.
  await expect(page.getByTestId("swap-status")).toContainText("Swap confirmado", { timeout: 15_000 });
  const row = page.getByTestId("history-row").filter({ hasText: `${amount}.0 TKA` });
  await expect(row).toContainText("confirmado");
  // The balance comes from the chain: it reflects exactly what the contract paid, not the quote.
  await expect(page.getByTestId("balance-from")).toHaveText(formatUnits(tkaBefore - parseUnits(amount, 18), 18));
  await expect(page.getByTestId("balance-to")).toHaveText(formatUnits(tkbBefore + received, 18));
});

test("has no detectable accessibility violations (axe)", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Valor a enviar").fill("100");
  await page.getByRole("button", { name: "Cotar" }).click();
  await expect(page.getByTestId("quote-panel")).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  expect(results.violations).toEqual([]);
});
