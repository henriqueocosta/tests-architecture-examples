---
name: writing-async-tests
description: Escreve testes de integração para comportamento assíncrono contra a stack real (confirmação por evento, falha que só aparece depois da resposta, idempotência, reprocessamento, componente parado), esperando por condição com prazo e com mensagens de falha que explicam a causa. Use quando uma operação responder antes de terminar (202, pending), quando houver indexer, fila, worker ou eventos, ou quando um teste usar sleep fixo ou falhar de forma intermitente.
---

# Testes assíncronos e de integração

Pergunta que esta camada responde: **as fronteiras reais funcionam juntas, no tempo certo?** A resposta chega antes da confirmação, e o teste só enxerga o resultado consultando até o estado final.

## Neste repositório

Ao adaptar esta skill, troque esta seção pelos caminhos e comandos do seu projeto.

| O quê | Onde |
|---|---|
| Espera por condição | `tests/async/waitFor.ts` (`waitFor(probe, { until, timeoutMs, description, diagnose })`) |
| Chamadas à stack | `tests/async/stack.ts` (`assertStackIsRunning`, `submitSwap`, `getSwap`, `indexerStatus`) |
| Testes | `tests/async/*.test.ts` |
| Ambiente | Stack local com `npm run dev`; num time real, o ambiente de testes implantado |
| Rodar | `npm run test:async` |
| Diagnóstico do indexer | `GET /__control/indexer` (rota só de ambiente de teste) |

## O que testar

- **Caminho feliz assíncrono:** `202 pending` → `confirmed`, com o valor que a peça real produziu.
- **Falha assíncrona:** aceita na hora, falha depois (na mini DEX, o slippage no bloco seguinte).
- **Idempotência:** reprocessar os mesmos eventos não duplica nada.
- **Componente parado:** o teste falha **e explica por quê**.

Fica de fora: o cálculo dos valores (componente) e a tela (UI e E2E).

## Passo a passo

1. Comece com `assertStackIsRunning()` no `before`, para a falha "stack fora do ar" ser explícita.
2. Crie os próprios dados pela API pública. Nunca dependa de dados deixados por outro teste.
3. Espere com `waitFor`, nunca com `sleep`. Defina `until`, um `timeoutMs` que cubra o pior caso realista e uma `description` legível.
4. Escreva o `diagnose`: o que o sistema estava fazendo quando o prazo acabou (status do indexer, último bloco processado, fila parada).
5. Afirme **propriedades estáveis**, não valores que mudam a cada execução: "o saldo mudou exatamente o que o contrato pagou", e não "a cotação foi 199.4".

## Exemplo

```ts
function waitForSwapToSettle(swapId: string) {
  return waitFor(() => getSwap(swapId), {
    until: (swap) => swap.status !== "pending",
    timeoutMs: CONFIRMATION_TIMEOUT_MS,
    description: `swap ${swapId} to leave "pending"`,
    diagnose: async () => {
      const indexer = await indexerStatus();
      const hint = indexer.paused ? "\nThe indexer is PAUSED: nothing will be confirmed." : "";
      return `Indexer status: ${JSON.stringify(indexer)}${hint}`;
    },
  });
}
```

## Regras

- Nenhum `sleep` ou `setTimeout` fixo em teste. Para encontrar os existentes, rode `scripts/find-fixed-waits.sh <pasta-de-testes>`. A única exceção é a pausa entre consultas dentro do helper de polling, marcada na própria linha com `// allow-fixed-wait: <motivo>`.
- Na falha, a mensagem mostra o que se esperava, o último valor visto e o estado do sistema.
- Siga a operação por um ID de correlação, da requisição ao resultado.
- Quando o ambiente permitir, controle o processamento (pausar, reprocessar) por rotas de teste, nunca por mudanças no código.
- Poucos testes, nas fronteiras de maior risco: cada um custa segundos.

## Verifique

1. Rode a suíte e veja passar.
2. Pare a peça assíncrona (na mini DEX, `npm run indexer:pause`), rode de novo e confira se a mensagem diz **o que** falhou, **por que** e **como resolver**. Retome (`npm run indexer:resume`).

## Checklist

- [ ] Dados criados pelo próprio teste
- [ ] `waitFor` com `description` e `diagnose`; nenhuma espera fixa
- [ ] Asserções sobre propriedades estáveis
- [ ] A falha com a peça parada explica a causa
