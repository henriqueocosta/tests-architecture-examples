---
name: writing-provider-states
description: Mantém a verificação de contrato do lado do provedor com Pact, implementando os provider states que os consumidores pedem e diagnosticando falhas de verificação. Use quando um consumidor publicar um contrato novo ou pedir um provider state, quando a verificação do provedor falhar, ou antes de renomear, remover ou mudar o tipo de um campo de resposta da API.
---

# Contrato do lado do provedor

Pergunta que esta camada responde: **a API ainda entrega o que os consumidores usam?** A verificação reenvia cada interação do contrato contra a API real. É aqui que uma quebra aparece, no PR da API, antes do deploy.

## Neste repositório

Ao adaptar esta skill, troque esta seção pelos caminhos e comandos do seu projeto.

| O quê | Onde |
|---|---|
| Verificação | `tests/contract/provider.test.ts` |
| Contrato lido | `pacts/MiniDexWeb-MiniDexApi.json` (num time real, baixado do Pact Broker) |
| Provider states | `stateHandlers` no `Verifier`, gravando no `api.store` e configurando os fakes |
| Fixtures | `quoteFixture` e `swapFixture` no mesmo arquivo |
| Rodar | `npm run test:contract:provider` (não precisa da stack) |

## Passo a passo: implementar um provider state pedido

1. Use o nome exato pedido pelo consumidor, letra por letra. Um nome diferente faz a interação falhar.
2. Leia os parâmetros recebidos (`params.quoteId`) em vez de fixar valores: o consumidor escolhe os identificadores.
3. Prepare o mínimo de estado: grave no store com as fixtures existentes ou mude o comportamento de um fake. Não chame rotas da API para preparar dados.
4. Se o estado depende de dados que outros estados podem ter deixado, limpe antes (`api.store.clear()`).
5. Rode a verificação.

```ts
"an expired quote exists": async (params: any) => {
  api.store.saveQuote(quoteFixture(params.quoteId, clock.now() - 1));
},
```

## Passo a passo: a verificação falhou

1. Leia o bloco "Failures" impresso pelo Pact: ele diz a interação, o campo e o que faltou, por exemplo `Actual map is missing the following keys: price`.
2. Decida de que lado está a mudança:
   - **A API mudou um campo que o consumidor usa.** É uma quebra. Reverta, ou faça uma mudança paralela: entregue o campo novo **e** o antigo até o consumidor migrar.
   - **O consumidor pediu algo novo** (interação ou estado ainda não implementado). Implemente o provider state. Com pending pacts no broker, essa falha não bloqueia o seu build até a primeira verificação bem-sucedida.
3. Nunca "conserte" a verificação editando o arquivo de contrato: ele pertence ao consumidor.

## Antes de mudar um campo de resposta

Procure o campo no contrato (`grep` no arquivo de pacto ou consulta ao broker). Se nenhum consumidor usa o campo, a mudança é segura. Se algum usa, siga a mudança paralela acima.

## Regras

- A verificação testa a mensagem, não o resultado de negócio: regra de cálculo é teste de componente.
- Num time real, publique o resultado da verificação no broker e rode `can-i-deploy` antes de cada deploy.

## Verifique

1. Rode `npm run test:contract:provider` e veja todas as interações com "OK".
2. Prove que a verificação protege o campo: renomeie-o na rota (por exemplo, `price` para `amount` em `api/src/routes/quotes.ts`), rode de novo e veja a falha. Desfaça.

## Checklist

- [ ] Nome do estado idêntico ao do contrato
- [ ] Parâmetros lidos de `params`, não fixados
- [ ] Estado mínimo, preparado direto no store ou nos fakes
- [ ] O arquivo de contrato não foi editado
- [ ] Uma quebra proposital fez a verificação falhar
