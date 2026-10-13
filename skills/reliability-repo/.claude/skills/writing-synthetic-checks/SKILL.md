---
name: writing-synthetic-checks
description: Escreve monitores sintéticos que exercitam as jornadas críticas em produção, em intervalo fixo, validando o resultado da jornada e não só se o processo está de pé. Use quando uma jornada crítica for lançada, quando um incidente passou despercebido pelo health check, ou quando pedirem monitoramento sintético, monitor de caixa-preta, smoke em produção ou alerta de disponibilidade.
---

# Monitoramento sintético

Pergunta que esta camada responde: **a jornada continua funcionando em produção agora?** Pega o que não veio do seu código: terceiro fora do ar, certificado expirado, configuração alterada.

## Neste repositório

Ao adaptar esta skill, troque esta seção pelos caminhos e comandos do seu projeto.

| O quê | Onde |
|---|---|
| Monitor | `synthetic/monitor.ts` (`probe(name, path, isValid)`, `runChecks`) |
| Parâmetros | `API_URL`, `SYNTHETIC_INTERVAL_S` (5), `SYNTHETIC_MAX_LATENCY_MS` (1000) |
| Rodar | `npm run synthetic` |
| Em produção | A mesma lógica numa ferramenta de monitoramento (Datadog, Checkly, Grafana Synthetic Monitoring), com alertas |

## Passo a passo

1. Escolha poucas jornadas críticas e curtas. Prefira o nível de API (mais barato e estável); use o navegador só quando o front for o risco.
2. Para cada jornada, valide **o resultado**: a cotação tem `quoteId`, a lista não está vazia. Um `200` com corpo errado também é falha.
3. Defina o limite de latência e o timeout de cada chamada.
4. Mantenha o health check, mas nunca sozinho: ele só prova que o processo responde.
5. Na mensagem de alerta, diga qual verificação falhou e por quê (`HTTP 503 PRICE_PROVIDER_UNAVAILABLE`, `slower than 1000 ms`).

## Exemplo

```ts
const results = [
  await probe("health", "/health", (body) => body?.status === "ok"),
  await probe("quotes", "/quotes?from=TKA&to=TKB&amount=1", (body) => typeof body?.quoteId === "string"),
];
```

Com o provedor de preço fora do ar, a linha fica `ALERTA  health 5 ms | quotes 6 ms (HTTP 503 PRICE_PROVIDER_UNAVAILABLE)`: o health check, sozinho, diria que está tudo bem.

## Regras

- **Sem efeitos colaterais reais:** o robô não cria pedidos, pagamentos ou transações. Use leituras, conta dedicada ou dados marcados como teste. Em Web3, nunca envie transações na mainnet.
- Credencial do robô só de variável de ambiente ou cofre, de uma conta dedicada com o mínimo de permissão. Nunca a conta de uma pessoa.
- Rode de mais de um local.
- Alerte só com falha persistente: nova tentativa e duração mínima. A mini DEX imprime cada rodada, para a demo; em produção, isso geraria ruído.
- Silencie os alertas em janelas de manutenção planejadas.
- Edge cases e regras de negócio já foram testados antes do deploy: não os repita aqui.

## Verifique

1. Rode o monitor e veja as linhas `OK`.
2. Provoque cada falha que ele deve pegar (na mini DEX, `npm run provider:down` e `npm run provider:slow`) e confira que a linha vira `ALERTA` com o motivo certo, enquanto o health continua OK. Restaure com `npm run provider:normal`.

## Checklist

- [ ] Valida o resultado da jornada, não só o status
- [ ] Nenhuma escrita real (pedido, pagamento, transação)
- [ ] Limite de latência e timeout definidos
- [ ] Cada falha provocada gerou o alerta com o motivo certo
