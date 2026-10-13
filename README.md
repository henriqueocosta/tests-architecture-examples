# Mini DEX: aplicação de demonstração

Aplicação local e pequena usada nas demonstrações ao vivo da palestra **"Quality Architecture: como projetar uma estratégia de testes para sistemas modernos"**.

É uma "exchange descentralizada" mínima: o usuário pede uma cotação para trocar o token `TKA` por `TKB` (ou o contrário), confirma o swap e acompanha a transação até ela ser confirmada na blockchain. O sistema tem de propósito os ingredientes que tornam um sistema moderno difícil de testar: uma integração externa que falha, processamento assíncrono, um contrato entre front-end e API e concorrência.

Para aprender com o projeto, siga o guia prático em [DEMO.md](DEMO.md): ele percorre cada camada da estratégia de testes, com os comandos para rodar, quebrar e restaurar, e os trechos de código que explicam cada técnica.

Para escrever testes assim com o Claude Code, veja [skills/](skills/README.md): uma skill para cada tipo de teste, organizadas como se cada uma morasse no repositório do time que a usa, para servir de base às suas.

## Arquitetura

```
Front-end (HTML/JS) --> API (Express + indexer em memória) --> Provedor de preço simulado
                                   |                                   (servidor local)
                                   v
                        Blockchain local (Hardhat + MiniSwap)
                                   |
                     evento Swapped --> indexer dentro da API
```

1. `GET /quotes` consulta o **provedor de preço** (um servidor local que simula uma integração externa, com preço que varia até ±0,5% a cada consulta, e que pode ser colocado em modo lento, fora do ar etc.) e a **taxa do protocolo** no contrato, e devolve o valor líquido que o usuário vai receber.
2. `POST /swaps` assina e envia a transação para a **blockchain local**, que minera um bloco a cada 3 s. A API responde `202 pending` na hora.
3. O **indexer**, dentro da API, acompanha os eventos `Swapped` e marca o swap como `confirmed`. Se a transação reverter (por exemplo, por slippage), o swap vira `failed` com o motivo.
4. `GET /balances` lê direto da blockchain o saldo de TKA e TKB da conta que assina os swaps. A tela mostra esse saldo, que só muda quando um swap é confirmado.

## Pré-requisitos (macOS)

| Ferramenta | Versão | Instalação |
| --- | --- | --- |
| Node.js | 24 LTS (mínimo 22.13) | `nvm install 24` e, na pasta do projeto, `nvm use` (há um `.nvmrc`) |
| k6 | 2.x | `brew install k6` (ou `brew upgrade k6`) |
| Claude Code (opcional) | atual | Só para experimentar as [skills](skills/README.md) |
| gitleaks (opcional) | 8.x | `brew install gitleaks`; só para rodar o scanner de secrets (`gitleaks dir .`) |

> A blockchain é **EVM** (a mesma tecnologia do Ethereum): contratos em Solidity (`.sol`). Não tem relação com a rede Solana.

## Instalação

```bash
nvm use
npm install
```

O `npm install` precisa de internet uma única vez: além dos pacotes, o `postinstall` baixa o compilador Solidity (`hardhat build`) e o Chromium do Playwright (`playwright install chromium`). **Depois disso, tudo funciona offline.**

## Uso

```bash
npm run dev
```

Sobe a blockchain e o provedor de preço; quando os dois estão prontos, faz o deploy dos contratos e sobe a API. Em cerca de 5 segundos a aplicação está em **http://127.0.0.1:3000**. `Ctrl+C` derruba tudo.

Para voltar ao estado inicial sem reiniciar (blockchain como logo após o deploy, histórico vazio, provedor normal, blocos a cada 3 s, estratégia de nonce padrão):

```bash
npm run reset
```

### Portas

| Serviço | Endereço |
| --- | --- |
| API + front-end | http://127.0.0.1:3000 |
| Provedor de preço simulado | http://127.0.0.1:4001 |
| Blockchain (JSON-RPC do Hardhat) | http://127.0.0.1:8545 |
| Servidor estático dos testes de UI | http://127.0.0.1:4173 (só durante `test:ui`) |
| Dashboard do k6 | http://127.0.0.1:5665 (só durante `perf`) |

## Testes

Cada tipo de teste roda de forma independente.

| Comando | Tipo | Precisa da stack rodando? | Tempo |
| --- | --- | --- | --- |
| `npm run test:api` | Componente da API (Supertest + Mocha + Chai), provedor e blockchain substituídos por fakes | Não | ~0,3 s |
| `npm run test:contract:consumer` | Contrato, lado consumidor (Pact sobre `web/apiClient.js`); gera `pacts/` | Não | ~0,1 s |
| `npm run test:contract:provider` | Contrato, lado provedor (verifica `pacts/` contra a API) | Não | ~0,5 s |
| `npm run test:async` | Assíncrono / integração, contra a stack real | **Sim** (`npm run dev`) | ~15 s |
| `npm run test:ui` | UI com a API simulada por `page.route` (Playwright) | Não | ~5 s |
| `npm run test:e2e` | E2E + acessibilidade com axe (Playwright) | Usa a stack se estiver rodando; se não, sobe sozinho | ~5 s |
| `npm run perf` | Performance (k6), com dashboard web | **Sim** | ~10 s |
| `npm run synthetic` | Monitoramento sintético (roda até `Ctrl+C`) | **Sim** | contínuo |
| `npm run typecheck` | Verificação de tipos do TypeScript | Não | ~1 s |

### Performance (k6)

`npm run perf` executa `perf/swaps.js`: cada usuário virtual pede uma cotação, envia o swap e consulta o status até "confirmed".

- Métricas: `swap_error_rate` (taxa de erro do `POST /swaps`), `time_to_confirmation` (do pedido do swap até a confirmação) e `swap_submission_time` (tempo para a API aceitar o swap).
- Thresholds: taxa de erro **igual a zero** e p95 de `time_to_confirmation` abaixo de 2,5 s.
- Durante a execução, o dashboard fica em http://127.0.0.1:5665. Ao final, o relatório é salvo em `perf/report.html`.
- Parâmetros por variável de ambiente: `VUS=20 ITERATIONS=5 P95_CONFIRMATION_MS=3000 npm run perf`.

## Comandos de controle (quebrar e restaurar)

| Comando | Efeito |
| --- | --- |
| `npm run provider:normal` | Provedor de preço responde normalmente |
| `npm run provider:slow` | Provedor demora 5 s (a API desiste em 2 s → `504`) |
| `npm run provider:down` | Provedor responde `500` (a API devolve `503`) |
| `npm run provider:429` | Provedor responde `429` (a API devolve `503`) |
| `npm run provider:malformed` | Provedor responde JSON inválido (a API devolve `502`) |
| `npm run chain:set-rate` | Muda a taxa on-chain para 1,5 (o provedor continua cotando 2,0 → falha por slippage) |
| `npm run chain:restore-rate` | Volta a taxa on-chain para 2,0 |
| `npm run chain:block-time <ms>` | Muda o intervalo de mineração da blockchain em execução (ex.: `1000`) |
| `npm run indexer:pause` / `indexer:resume` | Pausa / retoma o indexer |
| `npm run indexer:status` | Mostra o estado do indexer |
| `npm run indexer:replay [bloco]` | Reprocessa os eventos a partir do bloco (padrão 0) |
| `npm run nonce:naive` / `nonce:managed` | Troca a estratégia de nonce da API em execução |
| `npm run reset` | Volta tudo ao estado inicial |

## Variáveis de ambiente

Todas são opcionais; os valores padrão servem para as demos.

| Variável | Padrão | Onde | Descrição |
| --- | --- | --- | --- |
| `MINING_INTERVAL_MS` | `3000` | blockchain, `reset` | Intervalo de mineração dos blocos |
| `PORT` | `3000` | API | Porta da API e do front-end |
| `PRICE_PROVIDER_URL` | `http://127.0.0.1:4001` | API, scripts | Endereço do provedor de preço |
| `PRICE_TIMEOUT_MS` | `2000` | API | Timeout da chamada ao provedor |
| `QUOTE_TTL_MS` | `15000` | API | Validade da cotação |
| `SLIPPAGE_BPS` | `100` | API | Tolerância de slippage em pontos-base (100 = 1%) |
| `NONCE_STRATEGY` | `naive` | API | Estratégia de nonce inicial: `naive` ou `managed` |
| `INDEXER_POLL_MS` | `1000` | API | Intervalo de consulta do indexer |
| `LOG_LEVEL` | (vazio) | API | `silent` desliga os logs |
| `RPC_URL` | `http://127.0.0.1:8545` | API, scripts | Endereço da blockchain |
| `API_URL` | `http://127.0.0.1:3000` | testes, scripts, k6, sintético | Endereço da API |
| `PRICE_PROVIDER_PORT` | `4001` | provedor | Porta do provedor simulado |
| `PRICE_PROVIDER_SLOW_DELAY_MS` | `5000` | provedor | Atraso do modo `slow` |
| `PRICE_PROVIDER_VARIATION` | `0.005` | provedor | Variação aleatória do preço em torno da referência (0.005 = ±0,5%). `0` deixa o preço fixo |
| `SYNTHETIC_INTERVAL_S` | `5` | sintético | Intervalo entre as verificações |
| `SYNTHETIC_MAX_LATENCY_MS` | `1000` | sintético | Latência acima da qual vira `ALERTA` |
| `VUS`, `ITERATIONS`, `P95_CONFIRMATION_MS` | `10`, `3`, `2500` | k6 | Carga e threshold do teste de performance |

## Estrutura

```
contracts/          MiniSwap.sol e TestToken.sol
scripts/            deploy, reset e comandos de controle das demos
shared/             endereços, contas de teste e operações do owner (usado por scripts, API e testes)
price-provider/     provedor de preço simulado
api/src/            API: app.ts (createApp com injeção de dependências), rotas, clientes, indexer, nonce
web/                front-end (HTML + JS puro); apiClient.js é o único módulo que faz HTTP
tests/api/          testes de componente da API
tests/contract/     testes de contrato (Pact); o pact gerado fica em pacts/
tests/async/        testes assíncronos contra a stack, com o helper waitFor
tests/ui/           testes de UI com a API simulada
tests/e2e/          testes E2E e de acessibilidade
tests/support/      fakes compartilhados (provedor, blockchain, relógio)
perf/               script do k6
synthetic/          monitoramento sintético
skills/             skills e agentes do Claude Code para cada tipo de teste (inativos; veja skills/README.md)
.claude/secrets-allowlist.txt   valores públicos que parecem secrets (contas do Hardhat), lidos pelo hook de secrets
.gitleaks.toml      configuração do scanner de secrets, com a mesma exceção
```

## Simplificações assumidas

Esta é uma aplicação de demonstração, não um sistema de produção:

- **Sem carteira (MetaMask).** A API assina as transações com uma conta de teste pública do Hardhat (conta #1). Num sistema real, o usuário assinaria no próprio navegador.
- **Estado em memória.** Cotações, swaps e o estado do indexer ficam na memória da API. Reiniciar zera tudo.
- **Saldo da conta de teste.** A tela mostra o saldo da conta que a API usa para assinar (1.000.000 TKA e 1.000.000 TKB após o deploy). Cada `npm run perf` gasta cerca de 1.500 TKA; `npm run reset` devolve o saldo inicial.
- **Contrato propositalmente simples.** `MiniSwap` troca a uma taxa de conversão fixa definida pelo owner. Não é um AMM.
- **Taxa do protocolo de 0,3%.** O `MiniSwap` desconta a taxa do valor recebido, e ela fica no pool. A API lê a taxa do contrato ao cotar, então a cotação já mostra o valor líquido (100 TKA → cerca de 199.4 TKB, taxa de cerca de 0.6 TKB).
- **Preço com variação pequena.** O provedor simulado varia o preço em até ±0,5% a cada cotação, como um preço de mercado. O swap executa pela taxa do contrato (fixa em 2,0), então o valor recebido pode diferir um pouco do cotado, sempre dentro da tolerância de slippage de 1%.
- **Rotas de controle sem autenticação.** As rotas `/__control/*` da API e do provedor existem apenas para as demos.
- **Estratégia de nonce e intervalo de blocos alteráveis em execução** (`nonce:*` e `chain:block-time`), para que a demo de performance não precise reiniciar a stack.
- **`npm run reset` reverte a blockchain para um snapshot** (`evm_snapshot`) tirado logo após o deploy, pois o nó do Hardhat 3 não oferece `hardhat_reset`. O efeito é o mesmo de uma blockchain nova, com os mesmos endereços.
- **O nó do Hardhat não registra cada chamada JSON-RPC** (o deploy desliga esse log), porque o indexer consulta a blockchain a cada segundo e o terminal ficaria ilegível. Os swaps aparecem nos logs estruturados da API.
- **Fora do escopo** (apenas mencionados na palestra): Docker, banco de dados, feature flags, testes unitários, pipeline de CI, SLO/observabilidade.

## Versões utilizadas

Hardhat 3.18, ethers 6.17, OpenZeppelin Contracts 5.6, Solidity 0.8.28, Express 5.2, tsx 4.23, TypeScript 7.0, Mocha 12, Chai 6, Supertest 7.3, Pact JS 17.1 (especificação V4), Playwright 1.63, @axe-core/playwright 4.13, concurrently 10, wait-on 9.5, k6 2.3.

## Autor

**Henrique Oliveira Costa**, Engenheiro de Qualidade de Software.

- GitHub: [@henriqueocosta](https://github.com/henriqueocosta)
- LinkedIn: [henrique-costa-aa08b515a](https://www.linkedin.com/in/henrique-costa-aa08b515a/)
