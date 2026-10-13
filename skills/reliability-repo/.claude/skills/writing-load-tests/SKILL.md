---
name: writing-load-tests
description: Escreve e roda testes de carga com k6, transformando metas de latência e de taxa de erro em thresholds que aprovam ou reprovam a execução, e conduz otimizações guiadas por medição. Use quando houver meta de desempenho ou SLO, suspeita de problema de concorrência, mudança que pode afetar latência, ou quando pedirem teste de carga, stress, spike, soak, k6 ou p95.
---

# Testes de carga

Pergunta que esta camada responde: **o sistema cumpre a meta sob volume e concorrência?** Carga também encontra bugs de correção: na mini DEX, a colisão de nonce só aparece com requisições simultâneas.

## Neste repositório

Ao adaptar esta skill, troque esta seção pelos caminhos e comandos do seu projeto.

| O quê | Onde |
|---|---|
| Script | `perf/swaps.js` (cotação → swap → polling até confirmar) |
| Métricas próprias | `swap_error_rate` (Rate), `time_to_confirmation` e `swap_submission_time` (Trend), `swaps_not_confirmed` (Counter) |
| Parâmetros | `VUS`, `ITERATIONS`, `P95_CONFIRMATION_MS`, `API_URL` |
| Rodar | `npm run perf` (dashboard em http://127.0.0.1:5665, relatório em `perf/report.html`) |
| Ambiente | Stack local isolada; restaure com `npm run reset` |

## Escolha o tipo pela pergunta

| Tipo | Pergunta |
|---|---|
| Smoke | O script funciona e o sistema aguenta poucos usuários? |
| Carga média | Como se comporta no volume esperado? |
| Stress | E acima do esperado? |
| Spike | Sobrevive a um pico súbito e curto? |
| Soak | Aguenta horas, sem vazamento nem degradação? |
| Breakpoint | Onde está o limite? |

## Passo a passo

1. **Escreva a meta antes de rodar**, em números: "taxa de erro 0% e p95 do tempo até a confirmação abaixo de 2,5 s". Sem meta, não há como dizer se passou.
2. Transforme a meta em `thresholds`. Meça o que o usuário sente (do pedido até a confirmação), não só o tempo da requisição HTTP.
3. Marque cada requisição com `tags: { name: "<etapa>" }` e crie métricas por etapa, para localizar o gargalo.
4. Rode um smoke primeiro: `VUS=1 ITERATIONS=1 npm run perf`.
5. Rode a carga. Se falhar, decomponha o tempo por etapa antes de mexer em qualquer coisa.
6. Mude **uma** variável, rode **o mesmo** teste e compare. Repita até a meta passar.

## Exemplo

```js
export const options = {
  scenarios: { swaps: { executor: "per-vu-iterations", vus: VUS, iterations: ITERATIONS, maxDuration: "3m" } },
  thresholds: {
    swap_error_rate: ["rate==0"],
    time_to_confirmation: [`p(95)<${P95_CONFIRMATION_MS}`],
    swaps_not_confirmed: ["count==0"],
  },
};
```

## Regras

- Leia percentis (p95, p99), nunca só a média.
- Varie as entradas entre usuários virtuais: requisições idênticas podem ser rejeitadas como duplicadas, ou ficar artificialmente rápidas por causa de cache.
- Regra de negócio fica com checks simples; quem valida regra é o teste funcional.
- Nunca rode contra ambiente compartilhado ou produção sem combinar com o time.
- Tokens vão em cabeçalho, lidos de `__ENV`, nunca na URL: URLs aparecem no relatório e no dashboard.
- Os números variam entre execuções. Compare sempre com o mesmo teste, no mesmo ambiente.

## Verifique

1. Confirme que o threshold **reprova** quando deveria: rode com uma meta impossível (`P95_CONFIRMATION_MS=1`) e veja o k6 terminar com código diferente de zero.
2. Restaure o ambiente ao terminar.

## Checklist

- [ ] Meta escrita antes de rodar e transformada em threshold
- [ ] Métrica do ponto de vista do usuário, e uma por etapa
- [ ] Smoke antes da carga
- [ ] Uma variável por vez, comparada com o mesmo teste
- [ ] O threshold reprovou com uma meta impossível
