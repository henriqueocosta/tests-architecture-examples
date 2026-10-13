---
name: writing-e2e-tests
description: Escreve testes E2E com Playwright para as poucas jornadas críticas do produto, no navegador real e sem simulação, incluindo verificação de acessibilidade com axe. Use quando surgir uma jornada crítica nova, quando um bug escapou de todos os testes de camadas mais baixas, ou quando pedirem teste ponta a ponta, smoke de jornada ou auditoria de acessibilidade das telas principais.
---

# Testes E2E

Pergunta que esta camada responde: **a jornada crítica funciona de ponta a ponta?** É o único teste que prova que todas as peças funcionam juntas. Também é o mais lento, o mais instável e o que menos diz **onde** quebrou. Por isso: um ou dois por jornada, não centenas.

## Neste repositório

Ao adaptar esta skill, troque esta seção pelos caminhos e comandos do seu projeto.

| O quê | Onde |
|---|---|
| Testes | `tests/e2e/*.spec.ts` |
| Configuração | `playwright.e2e.config.ts` (reaproveita a stack se já estiver rodando) |
| Acessibilidade | `@axe-core/playwright`, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` |
| Rodar | `npm run test:e2e` |

## Antes de escrever

1. Confirme que é uma jornada que paga as contas (cadastro, checkout, a operação principal). Se for um edge case ou uma falha de dependência, o teste pertence ao componente ou à UI simulada.
2. Procure se um E2E existente já atravessa a jornada. Prefira acrescentar uma asserção a criar um teste novo.
3. Se o motivo é um bug que escapou: escreva **também** o teste na camada mais baixa que o pegaria. O E2E sozinho diria só "ficou pendente".

## Entra e fica de fora

| Entra | Fica de fora |
|---|---|
| As jornadas que definem o produto | Edge cases e variações de entrada |
| A integração real: navegador, APIs, banco, blockchain | Falhas de dependências e estados de erro |
| Acessibilidade das telas dessas jornadas | Serviços de terceiros que você não controla: simule só eles |
| Configuração do ambiente: URLs, CORS, cookies | O que um teste mais baixo já cobre |

## Passo a passo

1. Prepare dados pela API, não pela tela. Use valores únicos para achar a linha do próprio teste num ambiente compartilhado (na mini DEX, um valor aleatório de 1000 a 9999).
2. Interaja pelo papel e pelo nome acessível: `getByLabel("Valor a enviar")`, `getByRole("button", { name: "Swap" })`.
3. Espere pelo estado, com prazo que cubra o pior caso real: `toContainText("Swap confirmado", { timeout: 15_000 })`.
4. Afirme propriedades estáveis. A cotação varia, então confira que ela está dentro da faixa; o saldo muda **exatamente** o que a blockchain pagou.
5. Rode o axe na tela da jornada, num estado relevante (com a cotação aberta), e exija zero violações.

## Exemplo

```ts
const received = (parseUnits(amount, 18) * 2n * 9970n) / 10000n; // same arithmetic as the contract

await page.getByRole("button", { name: "Swap" }).click();
await expect(page.getByTestId("swap-status")).toContainText("Swap confirmado", { timeout: 15_000 });
await expect(page.getByTestId("balance-to")).toHaveText(formatUnits(tkbBefore + received, 18));
```

## Regras

- Cada teste isolado, com os próprios dados; nenhuma dependência de ordem.
- Contas de teste, com credenciais lidas de variável de ambiente. Traces, vídeos e screenshots guardam tudo o que a tela mostrou: ficam fora do repositório (veja `keeping-secrets-out-of-tests`).
- Nenhuma espera fixa (`waitForTimeout`).
- Automação cobre só parte da acessibilidade: o axe não substitui revisão manual.
- Apague o E2E que só repete o que já está coberto embaixo.

## Verifique

1. Rode `npm run test:e2e` e veja passar.
2. Pare uma peça da jornada (na mini DEX, `npm run indexer:pause`), rode e confira que o teste falha. Note que a mensagem diz só o que a tela mostrou: é para isso que existem os testes mais baixos. Retome a peça.

## Checklist

- [ ] É uma jornada crítica, e nenhum E2E existente já a cobre
- [ ] Dados preparados por API, com valores únicos
- [ ] Localizadores por papel; nenhuma espera fixa
- [ ] Asserções sobre propriedades estáveis
- [ ] axe sem violações
- [ ] Se nasceu de um bug, o teste mais baixo também foi escrito
