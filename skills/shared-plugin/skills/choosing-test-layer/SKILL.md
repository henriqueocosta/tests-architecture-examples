---
name: choosing-test-layer
description: Decide em qual camada de teste uma mudança deve ser coberta (unitário, componente, contrato, UI com API simulada, assíncrono, E2E, carga ou sintético), priorizando por risco e pela camada mais baixa que detecta o problema. Use antes de escrever testes para uma feature, correção de bug ou refatoração, quando alguém perguntar "que teste eu escrevo para isso?", ou quando o teste certo pode estar em outro repositório.
---

# Escolhendo a camada de teste

Cada camada responde uma pergunta diferente. O erro mais comum é usar uma camada cara (E2E) para responder uma pergunta barata. Esta skill não escreve testes: ela decide **onde** o teste deve ficar e entrega o trabalho à skill da camada escolhida.

## Passo a passo

1. **Descreva a mudança em uma frase** e liste as fronteiras que ela toca: lógica interna, rota da API, campo de resposta consumido por outro sistema, evento assíncrono, tela, jornada inteira, latência sob carga.
2. **Estime o risco** de cada fronteira: impacto (dinheiro, dado incorreto, jornada bloqueada, reputação) × probabilidade (frequência de mudança, complexidade, terceiros instáveis, histórico de incidentes). Alto × alto recebe o maior investimento.
3. **Para cada risco, escolha a camada mais baixa que consegue detectá-lo**, usando a tabela de [references/layers.md](references/layers.md). Na dúvida entre duas camadas, fique com a mais baixa.
4. **Confira se a camada mora neste repositório.** Se morar, siga a skill daquela camada. Se não morar, não escreva o teste aqui: produza um pedido para o outro time, no formato de [references/handoff.md](references/handoff.md).
5. **Responda** com uma tabela curta: risco → camada → repositório → próximo passo.

## Regras de decisão

- O E2E diz **que** quebrou, não **onde**. Use-o só para as jornadas que pagam as contas, uma ou duas por produto.
- Falhas de dependência (timeout, 429, resposta malformada) são cenários de **componente**, não de E2E.
- Se o defeito pode estar do outro lado da rede, um mock o esconde: o teste precisa ir para o **contrato** ou para uma camada integrada.
- Um bug que só o E2E pegou pede um teste novo na camada mais baixa que o detectaria.
- Comportamento que depende de concorrência só aparece em teste de **carga**.
- O que só existe em produção (certificado, configuração, terceiro fora do ar) é coberto por **monitoramento sintético**.

## Exemplo

Mudança: "a API passa a cobrar a taxa lida do contrato em vez de uma constante".

| Risco | Camada | Repositório | Próximo passo |
|---|---|---|---|
| Valor líquido calculado errado | Unitário | API | `writing-unit-tests` para `deductFee` |
| Rota devolve a taxa errada ou quebra se a leitura falhar | Componente | API | `writing-component-tests` com a blockchain falsa |
| O front deixa de receber `fee` e `feeBps` | Contrato | Front (consumidor) e API (provedor) | Pedido de interação ao time do front |
| Cotação diverge do valor pago na blockchain real | E2E existente | Testes de sistema | Nenhum teste novo: o E2E da jornada de swap já confere o saldo |
