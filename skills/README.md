# Skills e agentes de teste para o Claude Code

Esta pasta traz uma skill do Claude Code para cada tipo de teste da palestra e dois agentes de apoio. Elas foram escritas **como se cada grupo morasse num repositório diferente**, como acontece num time real, para servir de base às suas próprias skills.

Na mini DEX tudo está num repositório só, para caber numa demo. Por isso os caminhos citados nas skills existem todos aqui, mas cada pasta abaixo representa um repositório separado. Os outros três repositórios têm o mesmo `settings.json` do `web-repo`.

## Mapa

```
skills/
├── shared-plugin/                        plugin instalado em TODOS os repositórios
│   ├── .claude-plugin/plugin.json
│   ├── skills/choosing-test-layer/       em qual camada testar; pedido para outro time
│   ├── skills/keeping-secrets-out-of-tests/  HAR, traces, fixtures e credenciais sem secrets
│   ├── hooks/                            bloqueia secrets antes de escrever, commitar ou dar push
│   └── agents/test-reviewer.md           revisão independente dos testes
├── web-repo/.claude/                     repositório do front-end
│   ├── settings.json                     habilita o plugin e proíbe ler arquivos de secret
│   └── skills/
│       ├── writing-ui-tests/             tela com a API simulada (Playwright)
│       └── writing-consumer-contracts/   contrato, lado do consumidor (Pact)
├── api-repo/.claude/                     repositório da API
│   ├── skills/
│   │   ├── writing-unit-tests/           regras puras
│   │   ├── writing-component-tests/      API isolada com fakes (Mocha + Supertest)
│   │   └── writing-provider-states/      contrato, lado do provedor (Pact)
│   └── agents/mutation-prover.md         prova que os testes pegam quebras
├── system-tests-repo/.claude/skills/     repositório de testes de sistema
│   ├── writing-async-tests/              confirmação por evento, idempotência (+ script)
│   └── writing-e2e-tests/                jornada crítica e acessibilidade
└── reliability-repo/.claude/skills/      repositório de confiabilidade
    ├── writing-load-tests/               k6 com thresholds
    └── writing-synthetic-checks/         monitor em produção
```

| Skill | Slides do roteiro | Parte do DEMO.md |
|---|---|---|
| `choosing-test-layer` | 11–15 | Mapa do guia |
| `writing-unit-tests` | 16–17 | (fora da demo) |
| `writing-component-tests` | 18–19 | Parte 2 |
| `writing-consumer-contracts` e `writing-provider-states` | 20–25 | Parte 3 |
| `writing-ui-tests` | 26–27 | Parte 4 |
| `writing-async-tests` | 28–31 | Parte 5 |
| `writing-e2e-tests` | 32–34 | Parte 6 |
| `writing-load-tests` | 36–40 | Parte 7 |
| `writing-synthetic-checks` | 50–51 | Parte 8 |

## Por que esta divisão

- **O que vale em qualquer lugar fica no plugin compartilhado:** os critérios para escolher a camada, o formato de pedido entre times e a revisão. Ele não cita caminhos, porque não sabe em qual repositório está.
- **O que é concreto fica em cada repositório:** onde estão os fakes, qual comando roda a suíte, como se declara um provider state.
- **O contrato é dividido em duas skills**, uma de cada lado, porque cada lado mora num repositório. O que liga os dois é o arquivo de contrato (ou o Pact Broker) e o pedido de provider state, no formato de [`references/handoff.md`](shared-plugin/skills/choosing-test-layer/references/handoff.md).
- **Quando o teste certo mora em outro repositório**, a skill não o escreve: ela entrega um pedido ao time dono.

## Proteção contra secrets

Uma skill é uma instrução: o Claude tende a segui-la, mas nada garante. Por isso a proteção contra publicar secrets está em camadas que o modelo não consegue ignorar:

| Camada | Arquivo | O que faz |
|---|---|---|
| Hook do plugin | [`shared-plugin/hooks/block-secrets.mjs`](shared-plugin/hooks/block-secrets.mjs) | Antes de cada escrita, commit ou push feito pelo Claude, procura padrões de secret (chaves de nuvem, tokens, JWT, chaves privadas, cabeçalhos de autenticação em HAR, senhas no código) e bloqueia. Também bloqueia comandos de shell que tocam `.env`, chaves e certificados |
| Permissões do repositório | `<repo>/.claude/settings.json` | `permissions.deny` impede o Claude de ler `.env`, chaves e pastas de secrets, inclusive por `cat` e redirecionamentos. Um plugin não pode trazer regras de permissão: elas ficam em cada repositório |
| Exceções explícitas | `.claude/secrets-allowlist.txt` na raiz do repositório | Valores que parecem secrets mas são públicos, cada um com o motivo. Na mini DEX, as contas de teste do Hardhat |
| Scanner no pre-commit e no CI | `.gitleaks.toml` na raiz | Pega o que qualquer pessoa commitar, com ou sem Claude. A mesma exceção do Hardhat está lá |
| Skill | `keeping-secrets-out-of-tests` | Explica as regras para HAR, traces, contratos, fixtures, relatórios e credenciais de monitor, para o Claude não tentar algo que o hook bloquearia |

Limites que valem conhecer:

- O hook procura padrões conhecidos. Um secret sem formato reconhecível, como uma senha qualquer fora de uma atribuição, passa. É por isso que o scanner no CI e a push protection do GitHub continuam necessários.
- Se o próprio hook falhar (erro interno), ele deixa a ação seguir e avisa, para um hook quebrado não travar todo o trabalho.
- A regra `Read(**/.env.*)` também bloqueia a leitura do `.env.example`. Se o Claude precisar dele, renomeie para `env.example` ou ajuste a regra.

## Anatomia de uma skill

Todas as skills de camada seguem a mesma estrutura, para você reconhecer o que trocar:

| Seção | O que contém | Ao adaptar |
|---|---|---|
| Frontmatter (`name`, `description`) | O que a skill faz e quando usar, com os termos que alguém digitaria | Ajuste os gatilhos ao vocabulário do seu time |
| Pergunta da camada | Uma frase, vinda do roteiro | Mantenha |
| **Neste repositório** | Caminhos, helpers e comandos | **Troque inteira** |
| Entra e fica de fora | O limite da camada | Mantenha; acrescente casos do seu domínio |
| Passo a passo e exemplo | Como escrever, com código real da mini DEX | Troque o exemplo por um do seu código |
| Regras | Boas práticas da camada | Mantenha |
| Verifique | Rodar, depois quebrar o código de propósito e ver o teste falhar | Troque os comandos |
| Checklist | O que conferir antes de terminar | Mantenha |

## Boas práticas aplicadas

- **A `description` decide quando a skill é usada.** Ela está na terceira pessoa, diz o que a skill faz e quando usar, e tem os termos que alguém digitaria. As descrições não se sobrepõem.
- **`SKILL.md` curto.** Detalhes que nem sempre são necessários ficam em `references/`, a um nível de distância, e só são lidos quando preciso (veja `writing-consumer-contracts/references/matchers.md`).
- **O que é determinístico vira script.** `writing-async-tests/scripts/find-fixed-waits.sh` procura esperas fixas; o Claude roda o script em vez de procurar por conta própria.
- **Toda skill fecha o ciclo:** rodar o teste, quebrar o código de propósito e ver o teste falhar.
- **Agente quando o trabalho pede isolamento.** O `test-reviewer` só lê arquivos e não revisa o próprio trabalho. O `mutation-prover` roda numa cópia isolada do repositório (`isolation: worktree`, que exige git), para nenhuma mutação vazar para o seu código.

## Como experimentar na mini DEX

As skills nesta pasta não estão ativas: o Claude Code só lê skills de `.claude/skills/` e de plugins. Para testá-las aqui:

```bash
# skills de camada: copie para a pasta que o Claude Code lê
mkdir -p .claude/skills .claude/agents
cp -R skills/*-repo/.claude/skills/* .claude/skills/
cp skills/api-repo/.claude/agents/* .claude/agents/

# regras de permissão: copie só elas, sem o marketplace de exemplo
node -e 'const s = require("./skills/web-repo/.claude/settings.json");
require("fs").writeFileSync(".claude/settings.json", JSON.stringify({ permissions: s.permissions }, null, 2))'

# plugin compartilhado (skills, hook e agente): carregue a pasta direto, sem marketplace
claude --plugin-dir ./skills/shared-plugin
```

Depois, peça algo como "a API vai começar a devolver o campo `slippageBps` na cotação e a tela vai mostrá-lo; que testes eu escrevo?". O Claude deve usar `choosing-test-layer` e, em seguida, as skills de contrato e de componente.

Para ver o hook bloqueando, peça "crie o arquivo config.ts com `export const AWS_KEY = "<chave>"`", trocando `<chave>` por `AKIA` seguido de `QWERTYUIOPASDFGH`, numa palavra só. A escrita é bloqueada e o Claude explica o motivo. A chave não aparece inteira aqui porque o próprio scanner acusaria este arquivo. Digite a chave você mesmo: se pedir ao Claude para inventar uma, ele às vezes erra o formato (35 caracteres em vez de 36, por exemplo), e um valor fora do formato real não é reconhecido. As chaves do Hardhat em `shared/deployment.ts` não são bloqueadas, porque estão na lista de exceções.

## Como levar para os seus repositórios

1. Copie a pasta `.claude/skills/<skill>` de cada camada para o repositório onde aquele teste mora.
2. Reescreva a seção **Neste repositório** e o exemplo com o seu código.
3. Publique o plugin compartilhado num marketplace interno e copie o `.claude/settings.json` de exemplo para cada repositório, trocando `sua-empresa` pelo seu marketplace. Ele habilita o plugin e traz as regras de permissão. Cada pessoa do time precisa aceitar a confiança na pasta, e pode precisar instalar o plugin uma vez (`claude plugin install quality-architecture@sua-empresa --scope project`).
4. Crie o `.claude/secrets-allowlist.txt` e o `.gitleaks.toml` de cada repositório só com os valores públicos dele, e rode o gitleaks no pre-commit e no CI.
5. Antes de confiar numa skill, avalie: escreva três pedidos reais (por exemplo, "adicione o erro 429 na cotação", "a tela precisa avisar que o swap demorou", "renomeie `price` para `rate`") e compare o resultado do Claude com e sem a skill.

Referências: [Skills no Claude Code](https://code.claude.com/docs/en/skills.md) · [Boas práticas para escrever skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices.md) · [Subagentes](https://code.claude.com/docs/en/sub-agents.md) · [Criar plugins](https://code.claude.com/docs/en/plugins/create.md)
