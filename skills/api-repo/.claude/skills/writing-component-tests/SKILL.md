---
name: writing-component-tests
description: Escreve testes de componente da API com Mocha e Supertest, rodando o serviço real com as dependências externas trocadas por fakes (provedor de preço por HTTP, blockchain em memória, relógio controlado). Use quando uma rota for criada ou alterada, quando um código de erro novo surgir, quando uma dependência externa puder falhar de um jeito novo (timeout, 429, resposta malformada), ou quando uma regra depender de tempo.
---

# Testes de componente da API

Pergunta que esta camada responde: **o serviço funciona isolado?** O código da API roda inteiro; só o que está fora dele é substituído. Falhas difíceis de provocar num ambiente real viram cenários de milissegundos.

## Neste repositório

Ao adaptar esta skill, troque esta seção pelos caminhos e comandos do seu projeto.

| O quê | Onde |
|---|---|
| Ponto de injeção | `createApp({ priceClient, chainClient, clock, config })` em `api/src/app.ts` |
| Provedor de preço falso, por HTTP | `tests/support/fakePriceProvider.ts` (`startFakePriceProvider`, `behaviors.normal/slow/down/rateLimited/invalidJson/missingPrice`) |
| Blockchain falsa | `tests/support/fakeChainClient.ts` (`confirm`, `revert`, `rejectNextSubmission`, `setBalances`, `setFeeBps`, `sentSwaps`) |
| Relógio falso | `tests/support/fakeClock.ts` (`advance`) |
| Configuração de teste | `tests/support/testConfig.ts` (timeout do provedor de 200 ms) |
| Testes | `tests/api/*.test.ts` |
| Rodar | `npm run test:api` (não precisa da stack) |

## O que validar

| O quê | Exemplo |
|---|---|
| Corpo de erro padrão | `{ error: { code, message } }` em toda falha |
| Mapeamento das falhas da dependência | timeout → 504; 429 e 500 → 503; JSON inválido → 502 |
| Validação de entrada | parâmetro inválido → 400; recurso inexistente → 404 |
| Regra de negócio na fronteira | 100 TKA → 199.4 TKB com a taxa lida da blockchain falsa |
| Limites de tempo | aceita 1 ms antes de expirar; 410 no limite |
| Efeitos colaterais | cotação expirada não envia transação (`chain.sentSwaps` vazio) |
| Assíncrono sob controle | o teste decide quando o bloco é "minerado" (`chain.confirm`) |

## Passo a passo

1. Monte a API num `beforeEach` com fakes novos, para cada teste ter estado próprio.
2. Configure a dependência para o cenário: `priceProvider.respondWith(behaviors.slow(config.priceTimeoutMs + 300))`, `chain.rejectNextSubmission(...)`, `clock.advance(...)`.
3. Faça a requisição com Supertest e afirme o status e o `error.code`. Afirme o efeito colateral quando ele é a regra.
4. Para cada dependência nova, cubra pelo menos: lenta, fora do ar, limite de requisições e resposta malformada.

## Exemplo

```ts
it("returns 410 QUOTE_EXPIRED once the validity has passed", async () => {
  const quoteId = await createQuote();
  clock.advance(config.quoteTtlMs);

  const response = await request(api.app).post("/swaps").send({ quoteId }).expect(410);

  expect(response.body.error.code).to.equal("QUOTE_EXPIRED");
  expect(chain.sentSwaps).to.be.empty;
});
```

## Regras

- Substitua só o que está fora do serviço. Nada de mocks de módulos internos.
- Fakes de rede falam HTTP de verdade, numa porta aleatória, para exercitar o cliente real (timeout, parsing, tratamento de erro).
- Relógio e aleatoriedade injetados: nenhum teste espera tempo real.
- O formato que outro sistema espera é responsabilidade do contrato, não deste teste.

## Verifique

1. Rode `npm run test:api` e veja o teste novo passar.
2. Quebre o que ele protege (mude o mapeamento de 429 para 500, renomeie o código de erro, remova a checagem de expiração) e veja o teste falhar. Desfaça.

## Checklist

- [ ] Fakes novos por teste; nenhum estado compartilhado
- [ ] Cada falha da dependência tem seu cenário
- [ ] Status e `error.code` afirmados; efeito colateral afirmado quando é a regra
- [ ] Nenhuma espera de tempo real
- [ ] O teste falhou quando o código foi quebrado de propósito
