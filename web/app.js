import { createApiClient } from "./apiClient.js";

const api = createApiClient();
const POLL_INTERVAL_MS = 1000;
const SLOW_CONFIRMATION_MS = 15000;
const AMOUNT_PATTERN = /^\d+(\.\d+)?$/;

const STATUS_LABELS = { pending: "pendente", confirmed: "confirmado", failed: "falhou" };
const ERROR_MESSAGES = {
  PRICE_PROVIDER_UNAVAILABLE: "Provedor de preços indisponível. Tente novamente em instantes.",
  PRICE_PROVIDER_TIMEOUT: "O provedor de preços demorou demais para responder. Tente novamente.",
  PRICE_PROVIDER_BAD_RESPONSE: "O provedor de preços enviou uma resposta inválida. Tente novamente.",
  QUOTE_EXPIRED: "Cotação expirada. Peça uma nova cotação.",
  INVALID_REQUEST: "Valor inválido. Use um número positivo, por exemplo 100 ou 2.5.",
};

const $ = (testId) => document.querySelector(`[data-testid="${testId}"]`);
const el = {
  form: $("swap-form"),
  amount: $("amount-input"),
  amountOut: $("quote-amount-out"),
  tokenFrom: $("token-from"),
  tokenTo: $("token-to"),
  balanceFrom: $("balance-from"),
  balanceTo: $("balance-to"),
  balanceFromLine: $("balance-from-line"),
  insufficient: $("balance-insufficient"),
  accountFrom: $("account-from"),
  accountTo: $("account-to"),
  flip: $("flip-button"),
  quote: $("quote-panel"),
  quoteFrom: $("quote-from"),
  quoteTo: $("quote-to"),
  price: $("quote-price"),
  feeRate: $("quote-fee-rate"),
  fee: $("quote-fee"),
  feeToken: $("quote-fee-token"),
  countdown: $("quote-countdown"),
  action: $("action-button"),
  error: $("error-message"),
  status: $("swap-status"),
  history: document.querySelector("#history"),
  historyEmpty: $("history-empty"),
};

// ---- State ----

let pair = { from: "TKA", to: "TKB" };
let quote = null;
let balances = null;
let countdownTimer = null;
// The main button drives the whole flow: empty -> ready -> quoting -> quoted (-> expired) -> sending.
// It only ever reads "Cotar" or "Swap"; the countdown lives in the quote details.
// Quoting is always allowed; swapping more than the balance is not.
let mode = "empty";

function setMode(newMode) {
  mode = newMode;
  const insufficient = renderBalanceCheck();
  el.action.textContent = mode === "quoted" || mode === "sending" ? "Swap" : "Cotar";
  el.action.disabled =
    mode === "empty" || mode === "quoting" || mode === "sending" || (mode === "quoted" && insufficient);
}

/** Marks the amount and the balance in red when the amount exceeds the balance. */
function renderBalanceCheck() {
  const insufficient =
    balances !== null && amountIsValid() && Number(el.amount.value) > Number(balances.balances[pair.from]);
  el.amount.classList.toggle("insufficient", insufficient);
  el.amount.setAttribute("aria-invalid", String(insufficient));
  el.balanceFromLine.classList.toggle("insufficient", insufficient);
  el.insufficient.hidden = !insufficient;
  return insufficient;
}

const secondsLeft = () => (quote ? Math.max(0, Math.ceil((Date.parse(quote.expiresAt) - Date.now()) / 1000)) : 0);
const amountIsValid = () => AMOUNT_PATTERN.test(el.amount.value.trim()) && Number(el.amount.value) > 0;

function showError(err) {
  el.error.textContent = ERROR_MESSAGES[err?.code] ?? `Erro: ${err?.message ?? err}`;
}

function clearMessages() {
  el.error.textContent = "";
  el.status.textContent = "";
}

// ---- Pair and amount ----

function tokenBadge(symbol) {
  const icon = document.createElement("span");
  icon.className = `token-icon ${symbol}`;
  icon.setAttribute("aria-hidden", "true"); // decorative: the letter comes from CSS
  return [icon, symbol];
}

function renderPair() {
  el.tokenFrom.replaceChildren(...tokenBadge(pair.from));
  el.tokenTo.replaceChildren(...tokenBadge(pair.to));
  renderBalances();
}

el.flip.addEventListener("click", () => {
  pair = { from: pair.to, to: pair.from };
  renderPair();
  discardQuote();
});

el.amount.addEventListener("input", () => {
  clearMessages();
  discardQuote();
});

// ---- Quote ----

el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (mode === "quoted") submitSwap();
  else if (mode === "ready" || mode === "expired") requestQuote();
});

async function requestQuote() {
  clearMessages();
  setMode("quoting");
  try {
    showQuote(await api.getQuote({ from: pair.from, to: pair.to, amount: el.amount.value.trim() }));
  } catch (err) {
    discardQuote();
    showError(err);
  }
}

function showQuote(newQuote) {
  quote = newQuote;
  el.amountOut.textContent = quote.amountOut;
  el.amountOut.classList.remove("empty");
  el.quoteFrom.textContent = quote.from;
  el.quoteTo.textContent = quote.to;
  el.price.textContent = String(quote.price);
  el.feeRate.textContent = `${(quote.feeBps / 100).toLocaleString("pt-BR")}%`;
  el.fee.textContent = quote.fee;
  el.feeToken.textContent = quote.to;
  el.quote.hidden = false;
  clearInterval(countdownTimer);
  tick();
  countdownTimer = setInterval(tick, 1000);
}

/** Forgets the current quote: the amount, the pair or the quote itself changed. */
function discardQuote() {
  quote = null;
  clearInterval(countdownTimer);
  el.quote.hidden = true;
  el.amountOut.textContent = "0";
  el.amountOut.classList.add("empty");
  setMode(amountIsValid() ? "ready" : "empty");
}

function tick() {
  if (secondsLeft() > 0) {
    el.countdown.textContent = `Cotação válida por ${secondsLeft()} s.`;
    if (mode !== "quoted") setMode("quoted");
    return;
  }
  clearInterval(countdownTimer);
  el.countdown.textContent = "Cotação expirada.";
  el.error.textContent = ERROR_MESSAGES.QUOTE_EXPIRED;
  setMode("expired");
}

// ---- Swap ----

async function submitSwap() {
  clearMessages();
  clearInterval(countdownTimer);
  setMode("sending");
  try {
    const { swapId } = await api.createSwap(quote.quoteId);
    discardQuote();
    el.status.textContent = "Swap pendente: aguardando confirmação na blockchain...";
    await refreshHistory();
    followSwap(swapId, Date.now());
  } catch (err) {
    if (err.code === "QUOTE_EXPIRED") discardQuote();
    else showQuote(quote); // the quote may still be valid: offer the swap again
    showError(err);
  }
}

async function followSwap(swapId, startedAt) {
  let swap;
  try {
    swap = await api.getSwap(swapId);
  } catch {
    setTimeout(() => followSwap(swapId, startedAt), POLL_INTERVAL_MS);
    return;
  }

  if (swap.status === "pending") {
    if (Date.now() - startedAt > SLOW_CONFIRMATION_MS) {
      el.status.textContent = "Swap pendente: a confirmação está demorando mais que o normal.";
    }
    setTimeout(() => followSwap(swapId, startedAt), POLL_INTERVAL_MS);
    return;
  }

  el.status.textContent =
    swap.status === "confirmed"
      ? `Swap confirmado no bloco ${swap.blockNumber}: você recebeu ${swap.amountOut} ${swap.to} (taxa: ${swap.fee} ${swap.to}).`
      : `Swap falhou: ${swap.failure?.message ?? "motivo desconhecido"}.`;
  await Promise.all([refreshHistory(), refreshBalances()]);
}

// ---- Balances ----

async function refreshBalances() {
  try {
    balances = await api.getBalances();
  } catch {
    return; // keep the last balances shown
  }
  renderBalances();
}

function renderBalances() {
  if (!balances) return;
  const account = `${balances.account.slice(0, 6)}…${balances.account.slice(-4)}`;
  el.accountFrom.textContent = account;
  el.accountTo.textContent = account;
  el.balanceFrom.textContent = balances.balances[pair.from];
  el.balanceTo.textContent = balances.balances[pair.to];
  setMode(mode); // the balance may now be enough, or no longer enough
}

// ---- History ----

async function refreshHistory() {
  let swaps;
  try {
    swaps = await api.listSwaps();
  } catch {
    return; // keep the last history shown
  }
  el.history.replaceChildren(...swaps.map(historyRow));
  el.historyEmpty.hidden = swaps.length > 0;
}

function historyRow(swap) {
  const row = document.createElement("tr");
  row.dataset.testid = "history-row";
  row.dataset.status = swap.status;
  const cells = [
    new Date(swap.createdAt).toLocaleTimeString("pt-BR"),
    `${swap.from} → ${swap.to}`,
    `${swap.amountIn} ${swap.from}`,
    swap.amountOut ? `${swap.amountOut} ${swap.to}` : "—",
    STATUS_LABELS[swap.status],
  ];
  for (const text of cells) {
    const cell = document.createElement("td");
    cell.textContent = text;
    row.append(cell);
  }
  return row;
}

renderPair();
discardQuote();
refreshHistory();
refreshBalances();
