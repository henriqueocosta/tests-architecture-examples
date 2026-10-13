---
name: writing-consumer-contracts
description: Escreve e atualiza testes de contrato do lado do consumidor com Pact, exercitando o cliente de API real do front e gerando o arquivo de pacto. Use quando uma chamada à API for criada ou alterada no cliente HTTP do front, quando a tela passar a usar um campo novo da resposta, quando um novo tipo de erro precisar ser tratado, ou quando mencionarem Pact, contrato, consumidor ou pacto.
---

# Contrato do lado do consumidor

Pergunta que esta camada responde: **o que o front pede e usa da API está registrado?** O teste roda o cliente de API real contra um mock do Pact e grava o contrato. Sozinho, ele não protege contra mudanças da API: quem detecta a quebra é a verificação do provedor, no repositório da API.

## Neste repositório

Ao adaptar esta skill, troque esta seção pelos caminhos e comandos do seu projeto.

| O quê | Onde |
|---|---|
| Cliente de API exercitado | `web/apiClient.js` (`createApiClient`, `ApiError`) |
| Testes | `tests/contract/consumer.test.ts` |
| Contrato gerado | `pacts/MiniDexWeb-MiniDexApi.json` |
| Rodar | `npm run test:contract:consumer` (apaga e regenera `pacts/`) |
| Publicação | Na mini DEX, o arquivo fica no repositório. Num time real, o CI publica no Pact Broker com a versão do commit |

## Passo a passo

1. Uma interação por teste. A descrição diz a intenção do consumidor: `"a request to swap using an expired quote"`.
2. Declare o estado que o provedor precisa reproduzir com `.given("<estado>", { parâmetros })`. Reutilize um estado existente quando servir; um estado novo exige trabalho do time da API.
3. Na resposta, coloque **só os campos que o front usa**, com os matchers de [references/matchers.md](references/matchers.md). Valor exato só quando o front depende dele, como `status: "pending"`.
4. Em `executeTest`, chame o cliente real (`createApiClient(mockServer.url)`) e verifique o que o front faz com a resposta. Nunca monte a requisição à mão no teste.
5. Rode o consumidor. Se criou um provider state novo, avise o time da API.

## Exemplo

```ts
it("gets 410 QUOTE_EXPIRED when swapping with an expired quote", async () => {
  await pact
    .addInteraction()
    .given("an expired quote exists", { quoteId: EXPIRED_QUOTE_ID })
    .uponReceiving("a request to swap using an expired quote")
    .withRequest("POST", "/swaps", (builder) => builder.jsonBody({ quoteId: EXPIRED_QUOTE_ID }))
    .willRespondWith(410, (builder) => builder.jsonBody(errorBody("QUOTE_EXPIRED", "Quote has expired")))
    .executeTest(async (mockServer) => {
      const error = await errorFrom(createApiClient(mockServer.url).createSwap(EXPIRED_QUOTE_ID));
      expect(error).to.include({ status: 410, code: "QUOTE_EXPIRED" });
    });
});
```

## Não coloque no contrato

- Cada regra de validação da API: um cenário de erro basta, verificando **como** a requisição falha, não **por quê**.
- Efeitos colaterais ("o pedido foi gravado"): isso é teste funcional do provedor.
- Campos que o front não lê. Campo a mais na resposta é permitido; campo a menos quebra o contrato.
- Dados reais. O contrato vai para o broker e fica visível para outros times: use valores fictícios com o formato certo, nunca exemplos copiados de produção.

## Quando o provedor precisa fazer algo

Se a interação usa um provider state que ainda não existe, termine com um pedido ao time da API no formato de passagem de bastão (veja a skill `choosing-test-layer`, se o plugin compartilhado estiver instalado). Diga o nome exato do estado, os parâmetros e o que ele precisa gravar.

## Verifique

1. Rode `npm run test:contract:consumer` e confira que o arquivo de pacto contém a interação nova.
2. Quebre o cliente de API (renomeie um campo que ele lê) e veja o teste do consumidor falhar.
3. Lembre: uma mudança só da API **não** quebra este teste. Isso é esperado.

## Checklist

- [ ] O teste usa o cliente de API real do front
- [ ] Só campos usados pelo front, com matchers por tipo ou formato
- [ ] Provider state com nome claro e parâmetros explícitos
- [ ] Pedido ao time da API, se o estado é novo
- [ ] As fixtures dos testes de UI continuam iguais às respostas do contrato
