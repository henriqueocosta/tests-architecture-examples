---
name: writing-unit-tests
description: Escreve testes unitários para regras puras da API (cálculo de valores, taxas, arredondamento, conversão de unidades, validação, expiração com relógio injetado), testando comportamento pela interface pública. Use quando uma função com lógica e sem I/O for criada ou alterada, quando um bug de cálculo for corrigido, ou quando pedirem teste unitário, edge cases ou mutation testing.
---

# Testes unitários

Pergunta que esta camada responde: **a lógica interna está certa?** É o feedback mais rápido e o diagnóstico mais preciso: quando falha, aponta a regra quebrada.

## Neste repositório

Ao adaptar esta skill, troque esta seção pelos caminhos e comandos do seu projeto.

| O quê | Onde |
|---|---|
| Candidatos naturais | `api/src/amounts.ts` (`toUnits`, `fromUnits`, `convert`, `deductFee`, `applySlippage`) |
| Testes | `tests/unit/<módulo>.test.ts` (Mocha + Chai; a pasta ainda não existe na mini DEX) |
| Rodar | `npx mocha "tests/unit/**/*.test.ts"` (usa a `.mocharc.json` do projeto) |

## Entra e fica de fora

| Entra | Fica de fora |
|---|---|
| Regras com lógica: preço, taxa, arredondamento, conversão de unidades | HTTP, banco, filas, outros serviços → componente e integração |
| Validação de entrada e expiração, com o relógio injetado | Getters, setters, mapeamentos sem lógica |
| Edge cases: zero, valor máximo, muitas casas decimais, divisão que arredonda | Métodos privados e a ordem interna das chamadas |

## Passo a passo

1. Liste os comportamentos da função, não as linhas. Um método pode ter vários comportamentos; cada um merece um teste.
2. Nomeie cada teste pelo comportamento: `"rounds the fee down, like the contract"`.
3. Para cada comportamento, escolha entradas que separem o certo do quase certo: valores em que um arredondamento para cima daria resultado diferente, limites exatos, zero.
4. Teste pela interface pública do módulo. Se precisar acessar algo privado, a regra provavelmente merece ser extraída para uma função própria.
5. Quando a regra existe em outro lugar (aqui, a mesma aritmética está em `MiniSwap.sol`), use os mesmos números nos dois lados.

## Exemplo

```ts
import { expect } from "chai";
import { deductFee, toUnits } from "../../api/src/amounts.ts";

describe("deductFee", () => {
  it("deducts 30 bps from the gross amount", () => {
    expect(deductFee(toUnits("200"), 30)).to.deep.equal({ amountOut: toUnits("199.4"), fee: toUnits("0.6") });
  });

  it("rounds the fee down, like the contract (integer division)", () => {
    expect(deductFee(333n, 30).fee).to.equal(0n); // 333 * 30 / 10_000 = 0.999
  });

  it("charges nothing when the fee is zero", () => {
    expect(deductFee(toUnits("200"), 0).fee).to.equal(0n);
  });
});
```

## Regras

- Um teste por comportamento; asserções sobre o resultado, não sobre como ele foi calculado.
- Se o teste quebra numa refatoração que não mudou o comportamento, ele está acoplado à implementação: reescreva.
- Cobertura mostra o que foi executado, não o que foi verificado. Prefira medir com mutation testing (Stryker, PIT) ou com o agente `mutation-prover`.

## Verifique

1. Rode os testes e veja passar.
2. Introduza uma mutação na regra (troque `/` por arredondamento para cima, `-` por `+`, `30` por `31`) e veja pelo menos um teste falhar. Desfaça a mutação.

## Checklist

- [ ] Cada comportamento tem um teste com nome que o descreve
- [ ] Edge cases escolhidos para separar o certo do quase certo
- [ ] Nenhuma dependência de rede, disco ou relógio real
- [ ] Uma mutação na regra fez o teste falhar
