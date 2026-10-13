# Guia prático: uma estratégia de testes na Mini DEX

Este guia percorre, na prática, cada camada de uma estratégia de testes para um sistema moderno. Em cada parte você roda os testes, quebra algo de propósito com um comando, vê o teste pegar o problema e depois restaura o sistema.

Cada parte tem a mesma estrutura:

- **O que você vai aprender:** a ideia que aquela camada de testes resolve.
- **Como funciona no código:** os trechos que importam, com link para o arquivo e as linhas.
- **Experimente:** os comandos, na ordem, com o que você deve ver em cada passo e por quê.
- **Conclusão:** o que levar daquela parte.

Os tempos e as saídas foram medidos num Mac e podem variar um pouco na sua máquina. Números de bloco, horários e IDs mudam a cada execução.

## Mapa do guia

| Parte | Camada da estratégia | Comando principal | Precisa da stack rodando? | Tempo |
| --- | --- | --- | --- | --- |
| 1 | O sistema sob teste | navegador | Sim | — |
| 2 | Componente da API | `npm run test:api` | Não | ~0,3 s |
| 3 | Contrato front ↔ API | `npm run test:contract:consumer` / `:provider` | Não | ~0,5 s |
| 4 | UI com API simulada | `npm run test:ui` | Não | ~5 s |
| 5 | Assíncrono / integração | `npm run test:async` | Sim | ~15 s |
| 6 | E2E + acessibilidade | `npm run test:e2e` | Sim | ~5 s |
| 7 | Performance | `npm run perf` | Sim | ~10 s por execução |
| 8 | Monitoramento sintético | `npm run synthetic` | Sim | contínuo |

A ordem sobe a pirâmide de testes: primeiro as camadas rápidas e isoladas (2 a 4), depois as lentas e integradas (5 e 6), e por fim o comportamento sob carga (7) e em produção (8). As partes podem ser feitas separadamente, mas a parte 1 ajuda a entender todas as outras.

---

## Antes de começar

Você precisa do Node.js 24 e do k6 instalados, e de um `npm install` já feito. Veja os pré-requisitos no [README.md](README.md).

1. **Suba a stack em um terminal** e deixe-o aberto, porque é nele que aparecem os logs:
   ```bash
   nvm use
   npm run dev
   ```
   O `npm run dev` sobe a blockchain local e o provedor de preço; quando os dois estão prontos, faz o deploy dos contratos e sobe a API. Está pronto quando aparecer a linha `"msg":"api listening"`.
2. **Abra um segundo terminal** para os comandos do guia, e rode `nvm use` nele também.
3. **Abra o app** no navegador: **http://127.0.0.1:3000**.
4. **Garanta o estado inicial:**
   ```bash
   npm run reset
   ```
   Saída esperada:
   ```
   Blockchain: back to block 9, blocks every 3000 ms
   Price provider: normal
   API: memory cleared, nonce strategy naive, indexer running
   ```
   Os experimentos deixam rastros: histórico de swaps, saldos alterados, taxa on-chain modificada, indexer pausado. O `reset` volta tudo ao estado logo após o deploy, sem reiniciar nada. Ele reverte a blockchain para um snapshot tirado no deploy ([`scripts/deploy.ts:60`](scripts/deploy.ts#L60), [`scripts/reset.ts:32-38`](scripts/reset.ts#L32-L38)):
   ```ts
   const reverted = await provider.send("evm_revert", [deployment.snapshotId]);
   // ...snapshots só podem ser usados uma vez: tira um novo para o próximo reset
   writeDeployment({ ...deployment, snapshotId: await provider.send("evm_snapshot", []) });
   await provider.send("evm_setIntervalMining", [MINING_INTERVAL_MS]);
   ```

> Se algo parecer estranho em qualquer ponto do guia, rode `npm run reset`. Se nem isso resolver, pare o primeiro terminal com `Ctrl+C` e rode `npm run dev` de novo.

---

## Parte 1: o sistema e a confirmação assíncrona

**O que você vai aprender:** o que o sistema faz, e os três motivos pelos quais ele é difícil de testar:

1. Depende de uma **integração externa** que pode falhar: o provedor de preço.
2. O resultado é **assíncrono**: a API responde antes de a blockchain confirmar.
3. Tem **regras de negócio** que dependem de estado externo: a taxa e o saldo vêm da blockchain.

Cada parte seguinte testa um desses pontos na camada mais adequada.

### Como funciona no código

**A API não espera a blockchain.** O `POST /swaps` envia a transação e responde `202 pending` imediatamente. A confirmação chega depois, por outro caminho ([`api/src/routes/swaps.ts:60-71`](api/src/routes/swaps.ts#L60-L71)):
```ts
// Confirmation comes from the indexer; a revert is detected here, from the receipt.
chainClient
  .waitForFailure(txHash)
  .then((failure) => {
    if (!failure) return;
    swap.status = "failed";
    swap.failure = failure;
  });

res.status(202).json({ swapId: swap.swapId, txHash, status: swap.status });
```

**Quem confirma é o indexer**, que lê os eventos `Swapped` dos blocos novos a cada segundo ([`api/src/indexer.ts:37-43`](api/src/indexer.ts#L37-L43)):
```ts
const swap = store.findSwapByTxHash(event.txHash);
if (!swap) return; // a swap not made through this API
swap.status = "confirmed";
swap.amountOut = fromUnits(event.amountOut);
swap.fee = fromUnits(event.fee);
```

**A taxa vem do contrato, não de uma constante na API.** Assim a cotação e a execução usam a mesma fonte da verdade ([`api/src/routes/quotes.ts:34-37`](api/src/routes/quotes.ts#L34-L37)):
```ts
const { price } = await priceClient.getPrice(`${from}-${to}`);
// The fee comes from the contract itself, the same source used when the swap executes.
const feeBps = await chainClient.getFeeBps();
const { amountOut, fee } = deductFee(convert(amountIn, price), feeBps);
```

### Experimente

1. **Observe o cartão de swap.** Ele tem **De: TKA** e **Para: TKB**, cada um com o saldo da conta de teste (*Saldo: 1000000.0*), lido direto da blockchain. O botão ⇅ inverte o par. O botão **Cotar** fica desabilitado até haver um valor.
2. **Digite `100` e clique em Cotar.** Você deve ver:
   - **Cerca de 199.4** no campo de baixo: 100 × ~2 = ~200 TKB, menos 0,3% de taxa.
   - Logo abaixo, a taxa (por exemplo *"Taxa (0,3%): 0.6 TKB · já descontada"*) e o preço (por exemplo *"1 TKA = 2.0037 TKB · Cotação válida por 15 s."*), contando para baixo.
   - O botão muda para **Swap**.

   Clique em **Cotar** mais algumas vezes: o preço muda um pouco a cada cotação. Como um preço de mercado real, o provedor simulado varia até **±0,5%** em torno da referência de 2,0 ([`price-provider/server.ts:17-25`](price-provider/server.ts#L17-L25)):
   ```ts
   const VARIATION = Number(process.env.PRICE_PROVIDER_VARIATION ?? 0.005);

   function currentPrice(reference: number): number {
     const factor = 1 + (Math.random() * 2 - 1) * VARIATION;
     return Number((reference * factor).toFixed(4));
   }
   ```
   A variação fica abaixo da tolerância de slippage da API (1%), então nunca faz um swap falhar. Para ter o preço fixo, suba a stack com `PRICE_PROVIDER_VARIATION=0 npm run dev`.

   A cotação tem validade justamente porque o preço muda. Essa contagem regressiva é o primeiro comportamento que precisa de um relógio controlado para ser testado (partes 2 e 4).
3. **Clique em Swap.**
   - Imediatamente: *"Swap pendente: aguardando confirmação na blockchain..."*. A API respondeu `202`, mas **o saldo ainda não mudou**, porque a transação espera o próximo bloco (um a cada 3 s).
   - Em até 5 segundos (próximo bloco + indexer + atualização da tela; às vezes em menos de 1 s, se o bloco estava para sair): *"Swap confirmado no bloco N: você recebeu 199.4 TKB (taxa: 0.6 TKB)."*. A linha aparece no histórico como **confirmado**, e os saldos mudam para *999900.0* (TKA) e *1000199.4* (TKB).

   Repare que o valor recebido é **exatamente 199.4**, mesmo que a cotação tenha mostrado, por exemplo, 199.8. A cotação é uma estimativa feita com o preço do provedor; quem decide o valor final é o contrato, pela taxa on-chain (2,0). A diferença fica sempre dentro da tolerância de slippage.

   Isso é **consistência eventual**: o sistema chega ao estado certo, mas não na hora. Um teste que conferisse o saldo logo após o `202` falharia de forma intermitente. A parte 5 mostra como testar isso corretamente.
4. **Digite `2000000`**, mais que o saldo. O valor e o saldo ficam **vermelhos**, com *"insuficiente"* ao lado. **Cotar** continua disponível, mas **Swap** fica desabilitado depois de cotar. A regra está em [`web/app.js:59-73`](web/app.js#L59-L73):
   ```js
   el.action.disabled =
     mode === "empty" || mode === "quoting" || mode === "sending" || (mode === "quoted" && insufficient);
   ```
   A palavra *"insuficiente"* existe para o aviso não depender só da cor (critério WCAG 1.4.1). Ferramentas automáticas como o axe não detectam esse tipo de problema; quem garante este comportamento é o teste de UI da parte 4.
5. **Olhe os logs no primeiro terminal.** Procure `"msg":"swap submitted"` e, segundos depois, `"msg":"swap confirmed"`. As duas linhas têm **o mesmo `correlationId`**.

   A confirmação acontece em outro momento e em outro componente (o indexer), mas os logs continuam ligados à requisição original. O ID é criado por requisição em [`api/src/app.ts:40-46`](api/src/app.ts#L40-L46), guardado no swap e reaproveitado pelo indexer ([`api/src/indexer.ts:44`](api/src/indexer.ts#L44)). Sem isso, seria muito difícil rastrear um problema assíncrono em produção.

**Conclusão:** antes de escolher os testes, identifique o que torna o sistema difícil de testar. Aqui são a dependência externa, a assincronia e o estado na blockchain. Cada um pede uma técnica diferente.

---

## Parte 2: testes de componente da API

**O que você vai aprender:** como testar a API **isolada**, trocando tudo o que está fora dela (provedor de preço, blockchain e relógio) por fakes controlados pelo teste. Assim, cada falha de integração vira um teste determinístico de milissegundos, sem precisar da stack.

### Como funciona no código

**A API recebe suas dependências por injeção.** O `createApp` não cria clientes nem lê o relógio por conta própria ([`api/src/app.ts:17-26`](api/src/app.ts#L17-L26)):
```ts
export type AppDependencies = {
  priceClient: PriceClient;
  chainClient: ChainClient;
  clock: Clock;
  config: Config;
};

export function createApp({ priceClient, chainClient, clock, config }: AppDependencies) {
```
Em produção, [`api/src/server.ts`](api/src/server.ts) passa o cliente HTTP real, a blockchain real e `Date.now()`. Nos testes, passamos fakes ([`tests/api/quotes.test.ts:19-27`](tests/api/quotes.test.ts#L19-L27)):
```ts
priceProvider = await startFakePriceProvider();
({ app } = createApp({
  config,
  clock,                                        // relógio falso
  priceClient: createHttpPriceClient({ baseUrl: priceProvider.url, timeoutMs: 200 }),
  chainClient: createFakeChainClient().client,  // blockchain em memória
}));
```

**O provedor falso fala HTTP de verdade**, numa porta aleatória. Por isso o cliente HTTP real da API, com timeout e tratamento de erro, também é exercitado. Cada teste escolhe o comportamento do provedor ([`tests/support/fakePriceProvider.ts:15-26`](tests/support/fakePriceProvider.ts#L15-L26)):
```ts
slow: (delayMs) => (req, res, next) => setTimeout(() => behaviors.normal(req, res, next), delayMs),
down: (_req, res) => res.status(500).json({ error: "internal error" }),
rateLimited: (_req, res) => res.status(429).json({ error: "too many requests" }),
invalidJson: (_req, res) => res.type("application/json").send('{"price": '),
```

**Exemplo: o timeout** ([`tests/api/quotes.test.ts:60-66`](tests/api/quotes.test.ts#L60-L66)). O provedor demora 500 ms e a API desiste em 200 ms:
```ts
it("returns 504 PRICE_PROVIDER_TIMEOUT when the provider is slower than the timeout", async () => {
  priceProvider.respondWith(behaviors.slow(config.priceTimeoutMs + 300));

  const response = await request(app).get("/quotes?from=TKA&to=TKB&amount=100").expect(504);

  expect(response.body.error.code).to.equal("PRICE_PROVIDER_TIMEOUT");
});
```
O código testado é o mapeamento de falhas em [`api/src/priceClient.ts:10-26`](api/src/priceClient.ts#L10-L26): timeout vira `504`, 429 e 500 viram `503`, e JSON inválido vira `502`.

**Exemplo: expiração com relógio falso** ([`tests/api/swaps.test.ts:62-77`](tests/api/swaps.test.ts#L62-L77)). Em vez de esperar 15 s, o teste avança o relógio e verifica a borda exata:
```ts
it("accepts a quote one millisecond before it expires", async () => {
  const quoteId = await createQuote();
  clock.advance(config.quoteTtlMs - 1);
  await request(api.app).post("/swaps").send({ quoteId }).expect(202);
});

it("returns 410 QUOTE_EXPIRED once the validity has passed", async () => {
  const quoteId = await createQuote();
  clock.advance(config.quoteTtlMs);
  const response = await request(api.app).post("/swaps").send({ quoteId }).expect(410);
  expect(chain.sentSwaps).to.be.empty; // nenhuma transação foi enviada
});
```

**Exemplo: a confirmação assíncrona, controlada pelo teste** ([`tests/api/swaps.test.ts:96-107`](tests/api/swaps.test.ts#L96-L107)). O teste decide quando o bloco é "minerado" e quando o indexer roda, sem esperar nada:
```ts
await api.indexer.poll();                     // nada minerado ainda
expect(status).to.equal("pending");

chain.confirm(submitted.txHash, toUnits("199.4"), toUnits("0.6"));  // "minera" o bloco
await api.indexer.poll();

expect(swap).to.include({ status: "confirmed", amountOut: "199.4", fee: "0.6" });
```

### Experimente

1. **Rode os testes:**
   ```bash
   npm run test:api
   ```
   Você deve ver **23 passing** em ~0,3 s, **sem a stack**. Os testes cobrem:
   - caminho feliz, com a taxa lida do contrato
   - timeout (504), fora do ar (503), 429 (503), resposta malformada (502)
   - entrada inválida (400) e cotação inexistente (404)
   - cotação expirada com relógio controlado (410)
   - transação rejeitada pelo nó (500)
   - revert e confirmação pelo indexer

   Repare no tempo: são 23 cenários, metade deles de falha, em menos de meio segundo.
2. **Quebre o provedor real** para ver, na tela, uma das falhas que o teste cobre:
   ```bash
   npm run provider:slow
   ```
   No navegador, digite um valor e clique em **Cotar**. Depois de 2 segundos aparece em vermelho: *"O provedor de preços demorou demais para responder. Tente novamente."*. A API devolveu `504 PRICE_PROVIDER_TIMEOUT`.

   Experimente também:
   - `npm run provider:429` → *"Provedor de preços indisponível. Tente novamente em instantes."*
   - `npm run provider:malformed` → *"O provedor de preços enviou uma resposta inválida. Tente novamente."*

   O mesmo `504` que o teste verifica em 200 ms aparece na tela real depois de 2 s. O cenário do teste não é inventado.
3. **Restaure:**
   ```bash
   npm run provider:normal
   ```
   **Cotar** volta a funcionar.

**Conclusão:** reproduzir cada falha à mão exige um comando e uma espera. Com injeção de dependências, o teste de componente cobre todas em 0,3 s, com precisão de milissegundos no relógio. Essa testabilidade é uma decisão de arquitetura (`createApp` recebe as dependências), não de teste: ela precisa estar no código desde o início.

---

## Parte 3: testes de contrato (Pact)

**O que você vai aprender:** o problema que só o teste de contrato pega. Front-end e API podem passar nos próprios testes e ainda assim não funcionarem juntos. O teste do consumidor continua verde quando a API muda um campo; quem pega é a verificação do provedor, **antes do deploy e sem ambiente integrado**.

### Como funciona no código

**Lado do consumidor** ([`tests/contract/consumer.test.ts:34-65`](tests/contract/consumer.test.ts#L34-L65)). O teste usa o **código real do front**, `web/apiClient.js`, contra um servidor falso do Pact. Ele declara o que o front envia e o que espera receber:
```ts
await pact
  .addInteraction()
  .given("the price provider is available")          // estado que o provedor precisa preparar
  .uponReceiving("a request for a TKA to TKB quote")
  .withRequest("GET", "/quotes", (builder) => {
    builder.query({ from: "TKA", to: "TKB", amount: "100" });
  })
  .willRespondWith(200, (builder) => {
    builder.jsonBody({
      quoteId: uuid(QUOTE_ID),     // qualquer UUID
      from: "TKA",                 // exatamente "TKA"
      amountOut: like("199.4"),    // qualquer string
      price: like(2),              // qualquer número: o front mostra "1 TKA = 2 TKB"
      // ...
    });
  })
  .executeTest(async (mockServer) => {
    const quote = await createApiClient(mockServer.url).getQuote({ from: "TKA", to: "TKB", amount: "100" });
    expect(quote.price).to.equal(2);
  });
```
Se o teste passa, o Pact grava a expectativa em `pacts/MiniDexWeb-MiniDexApi.json`. Esse arquivo é o contrato.

**Como ler os matchers:**

| No contrato | Significa |
| --- | --- |
| `from: "TKA"` | o valor tem que ser exatamente esse |
| `like("199.4")` | basta ser do mesmo tipo (string) |
| `uuid(...)`, `regex(...)`, `iso8601DateTimeWithMillis(...)` | basta ter o formato |
| campo a mais na resposta | permitido: a API pode acrescentar campos |
| campo a menos ou renomeado | **quebra o contrato** |

**Lado do provedor** ([`tests/contract/provider.test.ts:77-100`](tests/contract/provider.test.ts#L77-L100)). O Pact sobe a API real (`createApp`), **reenvia cada requisição do contrato** e compara a resposta. Antes de cada interação, um *provider state* prepara o cenário pedido no `given(...)`:
```ts
stateHandlers: {
  "the price provider is down": async () => {
    priceProvider.respondWith(behaviors.down);
  },
  "an expired quote exists": async (params) => {
    api.store.saveQuote(quoteFixture(params.quoteId, clock.now() - 1));
  },
  // ...
},
```

**O contrato cobre 12 interações:**
- a cotação
- os erros que o front traduz em mensagens: 503, 504, 502, 400 e 410. Os erros do provedor de preço estão listados em [`consumer.test.ts:67-71`](tests/contract/consumer.test.ts#L67-L71).
- swap criado
- saldo
- status pendente, confirmado e com falha
- o histórico

### Como os dois lados se conectam

O teste de contrato é a soma dos dois lados, mas eles **não rodam juntos**. Cada um roda separado, e o que os liga é o arquivo de contrato:

```
npm run test:contract:consumer  ──►  pacts/MiniDexWeb-MiniDexApi.json  ──►  npm run test:contract:provider
"o front pede e entende isto"         o contrato                          "a API entrega isto"
```

Cada lado, sozinho, garante só metade. O consumidor diz o que o front espera, mas não se a API entrega. O provedor diz que a API cumpre um contrato, mas isso só vale se for o contrato atual do front. A garantia completa existe quando **os dois passaram contra a mesma versão do contrato**.

Num time real, front e API costumam ter repositórios e pipelines diferentes. O CI do front roda o consumidor e publica o contrato num **Pact Broker**; o CI da API baixa o contrato e roda a verificação; e, antes do deploy, o broker responde se aquela versão da API foi verificada contra o front que está em produção. Nenhum dos dois precisa subir o outro para testar.

Neste projeto não há broker: o arquivo em `pacts/` fica no repositório. O consumidor regenera o arquivo e o provedor só lê o que estiver lá. Por isso:

- **Mudou o front ou o teste do consumidor?** Rode o consumidor e depois o provedor. Rodando só o provedor, a API seria verificada contra o contrato antigo.
- **Mudou só a API?** Basta rodar o provedor, como no passo 4 abaixo.

### Experimente

1. **Rode os dois lados:**
   ```bash
   npm run test:contract:consumer
   npm run test:contract:provider
   ```
   Você deve ver **12 passing** e **1 passing**. O provedor imprime cada interação com *"has a matching body (OK)"*.

   São dois comandos independentes, ligados pelo arquivo de contrato (veja a seção anterior).
2. **Quebre o contrato** editando a API. Esta é a única parte do guia que pede uma edição de código. Em [`api/src/routes/quotes.ts`](api/src/routes/quotes.ts#L60), **linha 60**, troque
   ```ts
         price: quote.price,
   ```
   por
   ```ts
         amount: quote.price,
   ```
   e salve.

   É uma mudança "inocente", do tipo que alguém faz achando que melhora o nome do campo. Os testes da própria API continuam passando, porque não olham esse campo.
3. **Rode o consumidor de novo:**
   ```bash
   npm run test:contract:consumer
   ```
   Continua **12 passing**. O front e o teste dele não mudaram, então seguem verdes. **O teste do consumidor, sozinho, não protege contra mudanças do provedor.**
4. **Rode o provedor:**
   ```bash
   npm run test:contract:provider
   ```
   Agora você vê **1 failing**, com o diff:
   ```
   1) Verifying a pact between MiniDexWeb and MiniDexApi Given the price provider is available - a request for a TKA to TKB quote
       1.1) has a matching body
              $ -> Actual map is missing the following keys: price
       {
       +  "amount": 2,
           "amountIn": "100.0",
           ...
       -  "price": 2,
   ```
   e a mensagem final: *"The API no longer honors the contract expected by the front-end (see Failures above)"*.

   A falha diz **qual interação**, **qual campo** e **quem depende dele**. Sem o contrato, o problema só apareceria em produção, como *"1 TKA = undefined TKB"* na tela.
5. **Restaure:** desfaça a edição (volte para `price: quote.price,`), salve e rode `npm run test:contract:provider`. O resultado volta a **1 passing**.

**Conclusão:** o contrato avisa a API, antes do deploy e sem ambiente integrado, que uma mudança vai quebrar o front. Ele documenta exatamente o que o front usa; o resto a API pode mudar livremente.

---

## Parte 4: testes de UI com a API simulada

**O que você vai aprender:** como testar a **tela** no navegador real, com a API simulada. Isso permite alcançar estados difíceis de produzir com a stack real (cotação expirada, swap pendente para sempre, saldo insuficiente) de forma rápida e determinística.

### Como funciona no código

**A API é interceptada no navegador com `page.route`.** O front faz as mesmas chamadas HTTP de sempre, e o Playwright responde no lugar da API ([`tests/ui/mockApi.ts:23-35`](tests/ui/mockApi.ts#L23-L35)). Cada teste pode trocar a resposta de qualquer rota:
```ts
await page.route((url) => url.pathname === "/quotes", handlers.quotes ?? json(200, { ...QUOTE, expiresAt }));
await page.route((url) => url.pathname.startsWith("/swaps/"), handlers.getSwap ?? json(200, pendingSwap()));
await page.route((url) => url.pathname === "/balances", handlers.balances ?? json(200, balances("1000.0", "500.0")));
```

**O relógio do navegador também é falso** ([`tests/ui/quote-and-swap.spec.ts:63-77`](tests/ui/quote-and-swap.spec.ts#L63-L77)). O teste avança 15 s instantaneamente:
```ts
await page.clock.install({ time: NOW });
// ...cotação válida até NOW + 15 s
await expect(page.getByTestId("quote-countdown")).toHaveText("Cotação válida por 15 s.");

await page.clock.runFor(15_000);

await expect(page.getByTestId("quote-countdown")).toHaveText("Cotação expirada.");
await expect(page.getByRole("alert")).toHaveText("Cotação expirada. Peça uma nova cotação.");
```

**Exemplo: saldo insuficiente** ([`tests/ui/quote-and-swap.spec.ts:151-176`](tests/ui/quote-and-swap.spec.ts#L151-L176)). O teste verifica cor, acessibilidade e o estado dos botões:
```ts
await page.getByLabel("Valor a enviar").fill("1500");  // saldo simulado: 1000

await expect(page.getByTestId("amount-input")).toHaveCSS("color", red);
await expect(page.getByTestId("amount-input")).toHaveAttribute("aria-invalid", "true");
await expect(page.getByTestId("balance-from-line")).toContainText("insuficiente");
await expect(page.getByRole("button", { name: "Cotar" })).toBeEnabled();

await page.getByRole("button", { name: "Cotar" }).click();
await expect(page.getByRole("button", { name: "Swap" })).toBeDisabled();
```
Os testes localizam os elementos pelo papel e pelo nome acessível (`getByRole`, `getByLabel`), como um leitor de tela faria. Se um botão perder o nome acessível, o teste quebra.

### Experimente

1. **Rode os testes:**
   ```bash
   npm run test:ui
   ```
   Você deve ver **8 passed** em ~5 s, **sem a stack**:
   - cotação ok (valor líquido, taxa, preço, contagem regressiva e o botão virando *Swap*)
   - o botão ⇅ inverte o par e a cotação é pedida para TKB → TKA
   - provedor indisponível (mensagem em `role="alert"`)
   - cotação expirada pela contagem regressiva (relógio falso avança 15 s; o botão volta para *Cotar*)
   - cotação expirada recusada pela API (`410`)
   - swap **pendente indefinidamente** (20 s de relógio falso; a tela avisa *"a confirmação está demorando mais que o normal"*)
   - o saldo **só muda quando o swap é confirmado**, não enquanto está pendente
   - valor maior que o saldo: **Cotar** continua habilitado, **Swap** fica desabilitado, e o valor e o saldo ficam vermelhos

   Veja o teste do swap pendente ([`quote-and-swap.spec.ts:93-120`](tests/ui/quote-and-swap.spec.ts#L93-L120)). Com a stack real, seria preciso pausar o indexer e esperar 15 s; aqui a API simulada simplesmente nunca responde "confirmado".
2. **Compare com a tela real:** rode `npm run provider:down`, digite um valor e clique em **Cotar**. Aparece *"Provedor de preços indisponível. Tente novamente em instantes."*, o mesmo texto que o teste verifica. Restaure com `npm run provider:normal`.

   O mock reproduz uma resposta que a API real de fato dá. O que garante que os dois continuem iguais ao longo do tempo é o contrato da parte 3.

**Conclusão:** esperar 15 s de verdade para ver uma cotação expirar, ou forçar um swap a ficar pendente para sempre, seria lento e frágil. Com a API e o relógio controlados, leva segundos. O teste de UI confia no formato da API; o teste de contrato garante esse formato. As duas camadas se complementam.

---

## Parte 5: testes assíncronos (integração)

**O que você vai aprender:** como testar processamento assíncrono **contra a stack real** sem `sleep` fixo, que deixa o teste lento quando o sistema é rápido e frágil quando o sistema é lento. E como fazer o teste **explicar** a falha, em vez de só dizer "timeout".

### Como funciona no código

**`waitFor`: polling com prazo, em vez de esperar um tempo fixo** ([`tests/async/waitFor.ts:20-31`](tests/async/waitFor.ts#L20-L31)). O teste segue assim que a condição é atendida; se o prazo acabar, falha com contexto:
```ts
const deadline = Date.now() + timeoutMs;
let last: T;
do {
  last = await probe();
  if (until(last)) return last;
  await new Promise((resolve) => setTimeout(resolve, intervalMs)); // allow-fixed-wait: pause between polls
} while (Date.now() < deadline);

const details = diagnose ? `\n${await diagnose()}` : "";
throw new Error(`Timed out after ${timeoutMs} ms waiting for ${description}.\nLast value: ${JSON.stringify(last)}${details}`);
```

**O diagnóstico** ([`tests/async/swaps.test.ts:10-21`](tests/async/swaps.test.ts#L10-L21)). Quando o tempo acaba, o teste consulta o estado do indexer e diz o que fazer:
```ts
function waitForSwapToSettle(swapId: string) {
  return waitFor(() => getSwap(swapId), {
    until: (swap) => swap.status !== "pending",
    timeoutMs: 10_000,                       // ~3 blocos
    description: `swap ${swapId} to leave "pending"`,
    diagnose: async () => {
      const indexer = await indexerStatus();
      const hint = indexer.paused ? "\nThe indexer is PAUSED: nothing will be confirmed. Run: npm run indexer:resume" : "";
      return `Indexer status: ${JSON.stringify(indexer)}${hint}`;
    },
  });
}
```

**Idempotência do indexer** ([`api/src/indexer.ts:28-35`](api/src/indexer.ts#L28-L35)). Cada evento tem uma chave única (`txHash` + `logIndex`). Processar o mesmo evento de novo não muda nada:
```ts
const key = `${event.txHash}:${event.logIndex}`;
if (processedEvents.has(key)) {
  duplicatesSkipped++;
  return;
}
processedEvents.add(key);
```
Isso importa porque, em sistemas reais, eventos são reentregues: reorganização da cadeia, reinício do indexer, reprocessamento manual.

**Slippage: a falha só acontece quando o bloco é minerado.** O contrato recalcula o valor e reverte se ele ficou abaixo do mínimo ([`contracts/MiniSwap.sol:77-81`](contracts/MiniSwap.sol#L77-L81)):
```solidity
(amountOut, fee) = quote(tokenIn, tokenOut, amountIn);
// Slippage protection: the rate may have changed since the user got a quote.
if (amountOut < minAmountOut) {
    revert SlippageExceeded(amountOut, minAmountOut);
}
```
A API envia a transação com um gas limit fixo ([`api/src/chainClient.ts:14`](api/src/chainClient.ts#L14)), justamente para que ela seja aceita e falhe **de forma assíncrona**, como numa rede real. O motivo do revert é decodificado reexecutando a chamada naquele bloco ([`api/src/chainClient.ts:96-108`](api/src/chainClient.ts#L96-L108)).

### Experimente

1. **Rode os testes** (precisa da stack):
   ```bash
   npm run test:async
   ```
   Você deve ver **3 passing** em ~15 s:
   - confirmação assíncrona
   - idempotência do indexer via replay
   - falha por slippage (o próprio teste muda a taxa on-chain e restaura no final, em [`swaps.test.ts:57-59`](tests/async/swaps.test.ts#L57-L59))

   Cada teste dura o tempo real de um bloco, e não um `sleep(5000)` chutado.
2. **Quebre o indexer:**
   ```bash
   npm run indexer:pause
   ```
   No navegador, faça um swap: ele fica **pendente**. Depois de 15 s, a tela avisa *"a confirmação está demorando mais que o normal"*.

   Isso simula um componente assíncrono parado, como um consumidor de fila caído ou um job travado. A API continua respondendo `202`, então nada parece errado até alguém olhar a confirmação.
3. **Rode o teste de novo:**
   ```bash
   npm run test:async
   ```
   Agora você vê **1 passing, 2 failing** em ~30 s:
   ```
   Error: Timed out after 10000 ms waiting for swap 0e1a… to leave "pending".
   Last value: {… "status":"pending" …}
   Indexer status: {"paused":true,"lastProcessedBlock":14,"eventsIndexed":2,"duplicatesSkipped":1}
   The indexer is PAUSED: nothing will be confirmed. Run: npm run indexer:resume
   ```
   A mensagem diz **o que** falhou (o swap não saiu de pendente), **por que** (o indexer está pausado) e **como resolver**. O teste de slippage continua passando, porque falhas são detectadas pelo recibo da transação, não pelo indexer.
4. **Restaure:**
   ```bash
   npm run indexer:resume
   ```
   O swap pendente no navegador é confirmado em 1 a 2 segundos. Rode `npm run test:async` de novo: **3 passing**.
5. **Teste a idempotência na mão:**
   ```bash
   npm run indexer:replay
   ```
   Saída: `{ fromBlock: 0, toBlock: …, eventsFound: N, duplicatesSkipped: N }`.

   O indexer releu todos os eventos desde o bloco 0, e todos foram ignorados, porque já tinham sido processados. O histórico no navegador não muda. Sem a chave de idempotência, cada swap seria contado duas vezes.
6. **Provoque uma falha de slippage:**
   ```bash
   npm run chain:set-rate
   ```
   Espere o próximo bloco: *"MiniSwap rate: 2.0 -> 1.5 TKB per TKA"*. O provedor continua cotando cerca de 2,0, mas o contrato agora paga 1,5.

   No navegador, digite 100, clique em **Cotar** e depois em **Swap**. O swap fica pendente e, no bloco seguinte, aparece algo como *"Swap falhou: On-chain price moved: would receive 149.55, minimum accepted 196.64."*.

   149.55 é o que o contrato pagaria com a taxa nova (150 − 0,3%), e é sempre esse valor. O mínimo aceito é a cotação com 1% de tolerância, então varia um pouco junto com o preço cotado (entre ~196,4 e ~198,4). **O saldo não muda**, porque a transação reverteu e nenhum token saiu da conta.

   Restaure com `npm run chain:restore-rate`.

**Conclusão:** testes assíncronos devem esperar por uma **condição**, não por um **tempo**. E quando falham, devem coletar o estado do sistema para explicar a falha. Um "timeout" sem contexto custa horas de investigação.

---

## Parte 6: E2E e acessibilidade

**O que você vai aprender:** como testar o fluxo completo no navegador, contra a stack real, junto com a verificação automática de acessibilidade. E qual é o **custo** do E2E: ele pega o problema, mas não diz o porquê.

### Como funciona no código

**O fluxo do usuário, de ponta a ponta** ([`tests/e2e/swap-flow.spec.ts:8-38`](tests/e2e/swap-flow.spec.ts#L8-L38)). Nada é simulado. Como o preço da cotação varia, o teste não pode exigir um valor exato na tela. Ele verifica **propriedades**: a cotação está dentro da faixa de ±0,5%, e o saldo muda **exatamente** o que o contrato pagou, calculado com a mesma aritmética inteira do contrato:
```ts
// What the contract pays: on-chain rate 2, minus the 0.3% fee.
const received = (parseUnits(amount, 18) * 2n * 9970n) / 10000n;

await page.getByLabel("Valor a enviar").fill(amount);
await page.getByRole("button", { name: "Cotar" }).click();
// The quote is an estimate: the provider price varies up to ±0.5% around the on-chain rate.
const quoted = parseUnits((await page.getByTestId("quote-amount-out").textContent())!, 18);
const difference = quoted > received ? quoted - received : received - quoted;
expect(difference <= (received * 5n) / 1000n).toBe(true);

await page.getByRole("button", { name: "Swap" }).click();
await expect(page.getByTestId("swap-status")).toContainText("Swap confirmado", { timeout: 15_000 });
// The balance reflects exactly what the contract paid, not the quote.
await expect(page.getByTestId("balance-to")).toHaveText(formatUnits(tkbBefore + received, 18));
```
Essa é a regra para testes integrados com entradas que variam: **confira propriedades estáveis, não valores que mudam a cada execução**. Exigir o valor exato da cotação faria o teste falhar de forma aleatória.

**Acessibilidade com axe** ([`tests/e2e/swap-flow.spec.ts:40-49`](tests/e2e/swap-flow.spec.ts#L40-L49)). Verifica regras WCAG 2.1 A/AA (contraste, labels, papéis ARIA) com a cotação aberta:
```ts
const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
expect(results.violations).toEqual([]);
```
Durante o desenvolvimento, essa verificação pegou um problema real: o azul original do botão tinha contraste de 3,67:1, abaixo do mínimo de 4,5:1.

### Experimente

1. **Rode os testes:**
   ```bash
   npm run test:e2e
   ```
   Você deve ver **2 passed** em ~5 s: cotar → swap → ver **confirmado** no histórico, com o saldo da blockchain refletindo exatamente o swap, e zero violações no axe. Se a stack não estiver rodando, o Playwright a sobe sozinho.

   Este é o único teste que prova que todas as peças funcionam juntas, incluindo o navegador real.
2. **Quebre** com o mesmo problema da parte 5:
   ```bash
   npm run indexer:pause
   npm run test:e2e
   ```
   Agora você vê **1 failed, 1 passed** em ~18 s:
   ```
   Error: expect(locator).toContainText(expected) failed
   Locator: getByTestId('swap-status')
   Expected substring: "Swap confirmado"
   Received string:    "Swap pendente: aguardando confirmação na blockchain..."
   Timeout: 15000ms
   ```
   O E2E percebeu o problema, mas só sabe o que a tela mostra: "ficou pendente". Ele não tem como saber se a culpa é do indexer, da blockchain ou da API.
3. **Restaure:**
   ```bash
   npm run indexer:resume
   npm run test:e2e
   ```
   **2 passed**.

**Conclusão:** compare com a parte 5. O E2E demorou mais e só disse *"ficou pendente"*; o teste assíncrono disse *"o indexer está pausado"*. O E2E confirma que o todo funciona; os testes mais baixos na pirâmide dizem **onde** quebrou. Por isso uma boa estratégia tem poucos E2E e muitos testes de componente.

---

## Parte 7: performance com k6

**O que você vai aprender:** que teste de carga encontra **bugs de correção**, não só lentidão. E como fazer otimização guiada por medição: **medir → encontrar o gargalo → mudar → provar com o mesmo teste**.

O mesmo comando roda três vezes, com os mesmos thresholds: **taxa de erro = 0%** e **p95 do tempo até a confirmação < 2,5 s**. Durante cada execução, o dashboard do k6 fica em **http://127.0.0.1:5665**, e o relatório final é salvo em `perf/report.html`. Os valores exatos mudam um pouco a cada execução (o p95 do passo 1, por exemplo, fica em torno de 3,1 a 3,3 s); o que se repete é quais thresholds passam e quais falham em cada passo.

### Como funciona no código

**O script do k6** ([`perf/swaps.js:15-31`](perf/swaps.js#L15-L31)). Cada usuário virtual cota, envia o swap e consulta o status até a confirmação. As métricas e as metas ficam declaradas no próprio teste:
```js
const swapErrorRate = new Rate("swap_error_rate");                   // POST /swaps sem 202
const timeToConfirmation = new Trend("time_to_confirmation", true);  // do pedido até "confirmado"
const swapSubmissionTime = new Trend("swap_submission_time", true);  // até a API aceitar

thresholds: {
  swap_error_rate: ["rate==0"],
  time_to_confirmation: [`p(95)<${P95_CONFIRMATION_MS}`],  // padrão: 2500 ms
},
```
Os parâmetros mudam por variável de ambiente, por exemplo `VUS=20 P95_CONFIRMATION_MS=3000 npm run perf`.

**As duas estratégias de nonce.** Toda transação de uma conta leva um número de sequência, o *nonce*, e a rede aceita só uma transação por número.

A versão ingênua pergunta ao nó o próximo número a cada swap ([`api/src/nonce/naive.ts:13-16`](api/src/nonce/naive.ts#L13-L16)):
```ts
async withNonce(send) {
  const nonce = await wallet.getNonce("pending");  // dois pedidos simultâneos recebem o MESMO número
  return send(nonce);
},
```
A versão gerenciada guarda o número em memória e envia uma transação por vez ([`api/src/nonce/managed.ts:14-27`](api/src/nonce/managed.ts#L14-L27)):
```ts
withNonce(send) {
  const run = queue.then(async () => {
    nextNonce ??= await wallet.getNonce("pending");
    const result = await send(nextNonce);
    nextNonce++;
    return result;
  });
  queue = run.catch(() => {});
  return run;
},
```

### Experimente

Comece do estado inicial: `npm run reset`.

#### Passo 1: o teste de carga encontra um bug

```bash
npm run perf
```
Você deve ver uma **falha** (10 usuários virtuais, ~10 s):
```
POST /swaps 500: Replacement transaction underpriced. A gasPrice/maxFeePerGas of at least … is necessary to replace the existing transaction with nonce 5.
...
✗ 'rate==0' rate=80.00%
✗ 'p(95)<2500' p(95)=3.08s
```
**O bug:** com requisições simultâneas, várias leem o mesmo nonce antes de qualquer transação chegar ao nó:
```
Requisição A: getNonce() → 5
Requisição B: getNonce() → 5    ← a transação de A ainda não chegou ao nó
Requisição A: send(nonce 5) → aceita
Requisição B: send(nonce 5) → rejeitada: "replacement transaction underpriced"
```
A primeira é aceita e as outras são tratadas como tentativas de substituí-la.

**Por que nenhum outro teste viu:** os testes funcionais, e quem usa a tela, mandam um swap por vez. O bug depende de **concorrência**, e só um teste com requisições simultâneas contra a stack real o expõe. Não há nenhum atraso artificial no código: a colisão acontece naturalmente.

#### Passo 2: corrija o bug. A meta de latência continua falhando

```bash
npm run nonce:managed
npm run perf
```
Ainda é uma **falha**, mas por outro motivo:
```
✓ 'rate==0' rate=0.00%
✗ 'p(95)<2500' p(95)=3.1s
```
Os erros somem, porque o gerenciador entrega os números em fila. O custo da fila aparece em `swap_submission_time`, que sobe de ~50 ms para ~250 ms no p95. Mas o tempo até a confirmação continua acima da meta, porque é composto assim:
```
envio (POST /swaps)  →  espera pelo próximo bloco  →  indexer percebe  →  cliente percebe
     50–300 ms               0 a 3 s                       0 a 1 s            0 a 0,25 s
```
A espera pelo bloco domina, e no pior caso sozinha já chega a 3 s. **O gargalo não é o código da API**, então otimizá-lo seria esforço perdido.

#### Passo 3: otimize o gargalo

```bash
npm run chain:block-time 1000
npm run perf
```
Agora o teste **passa**:
```
✓ 'rate==0' rate=0.00%
✓ 'p(95)<2500' p(95)=1.15s
```
Blocos a cada 1 s reduzem a maior parcela do tempo de 0–3 s para 0–1 s. Mesmo código, mesma carga, mesmo teste.

#### Restaure

```bash
npm run reset
```
Volta para a estratégia `naive` e blocos a cada 3 s.

**Conclusão:** numa rede real não se muda o tempo de bloco. O equivalente é uma decisão de arquitetura: escolher uma rede ou L2 mais rápida, mudar a política de confirmação (mostrar "enviado" na hora e confirmar depois) ou reduzir o que está sob seu controle, como o intervalo do indexer (`INDEXER_POLL_MS`). O que vale levar é o ciclo: **medir → encontrar o gargalo → mudar → provar com o mesmo teste**.

---

## Parte 8: monitoramento sintético

**O que você vai aprender:** como verificar o sistema continuamente depois do deploy, **como um usuário faria**, e por que um health check raso não basta.

### Como funciona no código

A cada 5 s, o monitor chama duas rotas e imprime uma linha `OK` ou `ALERTA`, com latência e motivo ([`synthetic/monitor.ts:30-41`](synthetic/monitor.ts#L30-L41)):
```ts
const results = [
  await probe("health", "/health", (body) => body?.status === "ok"),
  await probe("quotes", "/quotes?from=TKA&to=TKB&amount=1", (body) => typeof body?.quoteId === "string"),
];
const ok = results.every((r) => r.ok);
console.log(`${time}  ${ok ? "OK    " : "ALERTA"}  ${details}`);
```
`/health` só diz que o processo da API está de pé ([`api/src/app.ts:58-60`](api/src/app.ts#L58-L60)). `/quotes` exercita o caminho que o usuário usa, incluindo o provedor externo. O `probe` também marca como `ALERTA` respostas mais lentas que `SYNTHETIC_MAX_LATENCY_MS` (padrão: 1000 ms).

### Experimente

1. **Inicie o monitor** em um terminal separado:
   ```bash
   npm run synthetic
   ```
   Uma linha a cada 5 s:
   ```
   17:10:42  OK      health 3 ms | quotes 4 ms
   ```
2. **Quebre o provedor:**
   ```bash
   npm run provider:down
   ```
   ```
   17:10:52  ALERTA  health 2 ms | quotes 5 ms (HTTP 503 PRICE_PROVIDER_UNAVAILABLE)
   ```
   Repare que o `/health` continua OK. Um monitor que olhasse só o health check diria que está tudo bem enquanto nenhum usuário consegue cotar.

   Experimente também `npm run provider:slow` → `ALERTA  health 3 ms | quotes 2003 ms (HTTP 504 PRICE_PROVIDER_TIMEOUT)`.
3. **Restaure:**
   ```bash
   npm run provider:normal
   ```
   As linhas voltam a `OK`. Use `Ctrl+C` para parar o monitor.

**Conclusão:** os testes das partes 2 a 7 rodam antes do deploy; o monitoramento sintético aplica o mesmo raciocínio depois do deploy. Ele verifica a jornada do usuário, não só se o processo está de pé.

---

## Rodando tudo de uma vez

Com `npm run dev` rodando, este comando executa todas as suítes e volta ao estado inicial. Tudo deve ficar verde em cerca de 30 s:

```bash
npm run test:api && npm run test:contract:consumer && npm run test:contract:provider && npm run test:ui && npm run test:async && npm run test:e2e && npm run reset
```

Para repetir qualquer parte do guia do zero, rode `npm run reset` antes.

## Próximo passo: escrever testes assim com o Claude Code

A pasta [`skills/`](skills/README.md) transforma as regras de cada parte deste guia em skills do Claude Code, uma por tipo de teste, organizadas como se cada uma morasse no repositório do time que a usa. Ela também traz um hook que impede o Claude de escrever, commitar ou publicar secrets, com as exceções explícitas para as contas de teste do Hardhat. O [`skills/README.md`](skills/README.md) explica como experimentar aqui e como adaptar para os seus repositórios.
