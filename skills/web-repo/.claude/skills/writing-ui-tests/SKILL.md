---
name: writing-ui-tests
description: Escreve testes de UI com Playwright no navegador real, com a API simulada por page.route e o relógio controlado por page.clock. Use quando a tela ganhar um estado novo (erro, carregamento, expiração, contagem regressiva, saldo insuficiente, processo pendente), quando uma mensagem ao usuário mudar, ou quando pedirem teste de componente do front ou de acessibilidade de um estado da tela.
---

# Testes de UI com a API simulada

Pergunta que esta camada responde: **a tela lida com cada resposta da API?** O front e o navegador são reais; só a rede é trocada. Estados que levariam minutos para provocar com a stack real ficam em milissegundos.

## Neste repositório

Ao adaptar esta skill, troque esta seção pelos caminhos e comandos do seu projeto.

| O quê | Onde |
|---|---|
| Testes | `tests/ui/*.spec.ts` |
| Mocks da API e fixtures | `tests/ui/mockApi.ts` (`mockApi`, `json`, `QUOTE`, `balances`, `pendingSwap`) |
| Servidor estático do front | `tests/ui/staticServer.ts`, iniciado pela config |
| Configuração | `playwright.ui.config.ts` |
| Rodar | `npm run test:ui` (não precisa da stack) |

## Entra e fica de fora

| Simule aqui | Não simule: vai para outra camada |
|---|---|
| Erros do servidor: 429, 503, 504, JSON malformado, lista vazia | O formato real da resposta → contrato |
| Tempo: cotação ou sessão expirada, contagem regressiva | Regras de negócio do back → componente da API |
| Processos longos: operação pendente para sempre | A jornada inteira com as peças reais → E2E |
| Dados que mudam a tela: saldo insuficiente, valores grandes | CORS, cookies, cabeçalhos, proxy → E2E ou smoke |

## Passo a passo

1. Nomeie o teste pelo comportamento visível: `"explains that the price provider is unavailable"`.
2. Monte os mocks com `mockApi(page, { ... })`, sobrescrevendo só a rota que muda o estado. As respostas partem das fixtures de `mockApi.ts`, nunca de objetos soltos no teste.
3. Se o estado depende de tempo, instale o relógio antes de abrir a página (`page.clock.install({ time: NOW })`) e avance com `page.clock.runFor(ms)`.
4. Interaja como uma pessoa: `getByLabel`, `getByRole` com o nome acessível. Use `getByTestId` só para ler valores que não têm papel acessível.
5. Verifique o que o usuário vê: texto, botão habilitado ou não, alerta com `role="alert"`. Verifique a requisição só quando ela é o resultado (por exemplo, o par enviado ao inverter os tokens).

## Exemplo

```ts
test("expires the quote when the countdown reaches zero", async ({ page }) => {
  await page.clock.install({ time: NOW });
  await mockApi(page, {
    quotes: json(200, { ...QUOTE, expiresAt: new Date(NOW.getTime() + 15_000).toISOString() }),
  });
  await page.goto("/");
  await quote(page);

  await page.clock.runFor(15_000);

  await expect(page.getByTestId("quote-countdown")).toHaveText("Cotação expirada.");
  await expect(page.getByRole("alert")).toHaveText("Cotação expirada. Peça uma nova cotação.");
});
```

## Regras

- Simule só na fronteira de rede. Nunca simule módulos, componentes ou o estado interno do front.
- Cada teste monta os próprios mocks e não depende da ordem dos outros.
- Avisos não podem depender só da cor (WCAG 1.4.1): verifique também o texto, como "insuficiente". O axe não detecta isso.
- Um HAR gravado da API real (`routeFromHAR`) carrega cookies e cabeçalhos de autenticação: limpe-o antes de commitar, como descreve a skill `keeping-secrets-out-of-tests`.
- Os mocks precisam ser fiéis ao provedor. Quando uma resposta nova entrar aqui, confira se o contrato do consumidor tem a interação equivalente; se não tiver, use a skill `writing-consumer-contracts`.

## Verifique

1. Rode `npm run test:ui` e veja o teste novo passar.
2. Quebre o que ele protege (remova o texto do aviso, troque o `aria-label`, inverta a condição do botão) e veja o teste falhar com uma mensagem que aponta o problema. Desfaça a quebra.

## Checklist

- [ ] O estado testado é difícil de produzir com a stack real
- [ ] Localizadores por papel e nome acessível
- [ ] Relógio falso para qualquer espera de tempo, nunca `waitForTimeout`
- [ ] O teste falhou quando o código foi quebrado de propósito
- [ ] A resposta simulada existe no contrato do consumidor
