// UI component tests: the real front-end in a real browser, API mocked.
// Each test pins one screen state that is hard to reach with the real stack.
import { expect, test, type Page } from "@playwright/test";
import { QUOTE, balances, json, mockApi, pendingSwap } from "./mockApi.ts";

const NOW = new Date("2026-01-01T12:00:00Z");

async function quote(page: Page, amount = "100") {
  await page.getByLabel("Valor a enviar").fill(amount);
  await page.getByRole("button", { name: "Cotar" }).click();
}

test("shows the quote with a countdown and turns the button into Swap", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByTestId("action-button")).toHaveText("Cotar");
  await expect(page.getByTestId("action-button")).toBeDisabled(); // no amount yet

  await quote(page);

  await expect(page.getByTestId("quote-amount-out")).toHaveText("199.4");
  await expect(page.getByTestId("quote-panel")).toContainText("Taxa (0,3%): 0.6 TKB · já descontada");
  await expect(page.getByTestId("quote-price")).toHaveText("2");
  await expect(page.getByTestId("quote-countdown")).toContainText("Cotação válida por");
  await expect(page.getByRole("button", { name: "Swap" })).toBeEnabled();
  await expect(page.getByTestId("error-message")).toBeEmpty();
});

test("inverts the pair with the flip button", async ({ page }) => {
  let requestedPair = "";
  await mockApi(page, {
    quotes: async (route) => {
      const url = new URL(route.request().url());
      requestedPair = `${url.searchParams.get("from")}-${url.searchParams.get("to")}`;
      await route.fulfill({ json: { ...QUOTE, from: "TKB", to: "TKA", amountOut: "50.0", price: 0.5, expiresAt: new Date(Date.now() + 15_000).toISOString() } });
    },
  });
  await page.goto("/");
  await expect(page.getByTestId("balance-from")).toHaveText("1000.0");

  await page.getByRole("button", { name: "Inverter o par" }).click();

  await expect(page.getByTestId("token-from")).toHaveText("TKB");
  await expect(page.getByTestId("balance-from")).toHaveText("500.0");
  await quote(page);
  expect(requestedPair).toBe("TKB-TKA");
  await expect(page.getByTestId("quote-amount-out")).toHaveText("50.0");
});

test("explains that the price provider is unavailable", async ({ page }) => {
  await mockApi(page, {
    quotes: json(503, { error: { code: "PRICE_PROVIDER_UNAVAILABLE", message: "Price provider answered 500" } }),
  });
  await page.goto("/");

  await quote(page);

  await expect(page.getByRole("alert")).toHaveText("Provedor de preços indisponível. Tente novamente em instantes.");
  await expect(page.getByTestId("quote-panel")).toBeHidden();
  await expect(page.getByRole("button", { name: "Cotar" })).toBeEnabled();
});

test("expires the quote when the countdown reaches zero", async ({ page }) => {
  await page.clock.install({ time: NOW });
  await mockApi(page, {
    quotes: json(200, { ...QUOTE, expiresAt: new Date(NOW.getTime() + 15_000).toISOString() }),
  });
  await page.goto("/");
  await quote(page);
  await expect(page.getByTestId("quote-countdown")).toHaveText("Cotação válida por 15 s.");

  await page.clock.runFor(15_000);

  await expect(page.getByTestId("quote-countdown")).toHaveText("Cotação expirada.");
  await expect(page.getByRole("button", { name: "Cotar" })).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveText("Cotação expirada. Peça uma nova cotação.");
});

test("explains an expired quote when the API rejects the swap with 410", async ({ page }) => {
  await mockApi(page, {
    createSwap: json(410, { error: { code: "QUOTE_EXPIRED", message: "Quote has expired, request a new one" } }),
  });
  await page.goto("/");
  await quote(page);

  await page.getByRole("button", { name: "Swap" }).click();

  await expect(page.getByRole("alert")).toHaveText("Cotação expirada. Peça uma nova cotação.");
  await expect(page.getByTestId("quote-panel")).toBeHidden();
  await expect(page.getByRole("button", { name: "Cotar" })).toBeEnabled();
});

test("keeps a swap pending indefinitely and tells the user it is slow", async ({ page }) => {
  await page.clock.install({ time: NOW });
  let statusRequests = 0;
  await mockApi(page, {
    quotes: json(200, { ...QUOTE, expiresAt: new Date(NOW.getTime() + 15_000).toISOString() }),
    getSwap: async (route) => {
      statusRequests++;
      await route.fulfill({ json: { ...pendingSwap(), createdAt: NOW.toISOString() } });
    },
    listSwaps: json(200, { swaps: [{ ...pendingSwap(), createdAt: NOW.toISOString() }] }),
  });
  await page.goto("/");
  await quote(page);

  await page.getByRole("button", { name: "Swap" }).click();

  const status = page.getByTestId("swap-status");
  await expect(status).toHaveText("Swap pendente: aguardando confirmação na blockchain...");
  await expect(page.getByTestId("history-row")).toContainText(["pendente"]);

  // 20 s of polling without the swap ever leaving "pending".
  for (let second = 0; second < 20; second++) {
    await page.clock.runFor(1_000);
  }

  await expect(status).toHaveText("Swap pendente: a confirmação está demorando mais que o normal.");
  expect(statusRequests).toBeGreaterThan(1);
});

test("updates the balance only when the swap is confirmed", async ({ page }) => {
  let confirmed = false;
  await mockApi(page, {
    getSwap: (route) =>
      route.fulfill({
        json: confirmed
          ? { ...pendingSwap(), status: "confirmed", amountOut: "199.4", fee: "0.6", blockNumber: 12 }
          : pendingSwap(),
      }),
    balances: (route) =>
      route.fulfill({ json: confirmed ? balances("900.0", "700.0") : balances("1000.0", "500.0") }),
  });
  await page.goto("/");
  await expect(page.getByTestId("balance-from")).toHaveText("1000.0");

  await quote(page);
  await page.getByRole("button", { name: "Swap" }).click();
  await expect(page.getByTestId("swap-status")).toContainText("Swap pendente");
  await expect(page.getByTestId("balance-from")).toHaveText("1000.0");

  confirmed = true; // the next block is "mined"

  await expect(page.getByTestId("swap-status")).toHaveText(
    "Swap confirmado no bloco 12: você recebeu 199.4 TKB (taxa: 0.6 TKB).",
  );
  await expect(page.getByTestId("balance-from")).toHaveText("900.0");
  await expect(page.getByTestId("balance-to")).toHaveText("700.0");
});

test("allows quoting but not swapping more than the balance, and shows it in red", async ({ page }) => {
  await mockApi(page); // balance: 1000 TKA
  await page.goto("/");
  await expect(page.getByTestId("balance-from")).toHaveText("1000.0");
  const red = "rgb(248, 113, 113)";

  await page.getByLabel("Valor a enviar").fill("1500");

  await expect(page.getByTestId("amount-input")).toHaveCSS("color", red);
  await expect(page.getByTestId("amount-input")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("balance-from-line")).toHaveCSS("color", red);
  await expect(page.getByTestId("balance-from-line")).toContainText("insuficiente");
  await expect(page.getByRole("button", { name: "Cotar" })).toBeEnabled();

  await page.getByRole("button", { name: "Cotar" }).click();

  await expect(page.getByTestId("quote-panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "Swap" })).toBeDisabled();

  // Back within the balance: nothing red, and a new quote can be swapped.
  await page.getByLabel("Valor a enviar").fill("1000");
  await expect(page.getByTestId("amount-input")).not.toHaveCSS("color", red);
  await expect(page.getByTestId("balance-insufficient")).toBeHidden();
  await page.getByRole("button", { name: "Cotar" }).click();
  await expect(page.getByRole("button", { name: "Swap" })).toBeEnabled();
});
