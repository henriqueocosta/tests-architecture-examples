---
name: keeping-secrets-out-of-tests
description: Mantém secrets e dados pessoais fora de testes, fixtures, gravações e relatórios (HAR, traces e screenshots do Playwright, contratos publicados no broker, massa de teste, relatórios de carga, credenciais de monitores). Use ao gravar um HAR ou trace da API real, ao criar fixtures a partir de dados de produção, ao configurar credenciais de teste ou de monitor, ao publicar contratos ou relatórios, ou quando o hook block-secrets bloquear uma ação.
---

# Secrets e dados sensíveis fora dos testes

Testes copiam o mundo real para dentro do repositório: respostas gravadas, telas, dados de exemplo. É assim que um token ou um CPF acaba num commit ou num artefato público. Esta skill explica as regras; o hook `block-secrets`, do mesmo plugin, bloqueia as violações mais comuns.

## O que o plugin e o repositório já impedem

| Proteção | Onde | O que faz |
|---|---|---|
| Hook `block-secrets` | Este plugin | Bloqueia escrever, commitar ou dar push em texto com padrão de secret, e comandos de shell que tocam arquivos de secret |
| Regras `permissions.deny` | `.claude/settings.json` de cada repositório | Impede o Claude de ler `.env`, chaves e pastas de secrets, inclusive por `cat`, `head` e redirecionamentos |
| Scanner no pre-commit e no CI (gitleaks) | Cada repositório | Pega o que qualquer pessoa commitar, com ou sem Claude |
| Push protection | Organização no GitHub | Última barreira |

Se o hook bloquear uma ação, não tente contorná-la (dividir o valor, codificar em base64, escrever por outro caminho). Diga ao usuário o que foi bloqueado e por quê.

## Regras por tipo de artefato

**Credenciais de teste e de monitor.** Sempre de variável de ambiente ou de um cofre (GitHub Actions secrets, Vault, 1Password). No código, só o nome da variável: `process.env.SYNTHETIC_API_TOKEN`. Documente as variáveis num `.env.example` com valores fictícios.

**HAR gravado da API real** (`routeFromHAR`). Antes de commitar, remova os cabeçalhos `authorization`, `cookie`, `set-cookie` e `x-api-key`, e troque dados pessoais por valores fictícios. Prefira gravar contra um ambiente de teste com contas de teste.

**Traces, vídeos e screenshots do Playwright.** Ficam fora do repositório (`test-results/`, `playwright-report/` no `.gitignore`). Em CI, publique como artefato com retenção curta e acesso restrito. Use contas de teste: o trace guarda tudo o que a tela mostrou e todas as requisições.

**Contratos (Pact).** Os exemplos do contrato vão para o broker e ficam visíveis para outros times. Use valores fictícios com o formato certo (`uuid(...)`, `regex(...)`), nunca dados copiados de produção.

**Fixtures e massa de teste.** Nunca copie dados de clientes de produção. Gere dados fictícios ou use uma base anonimizada. Dados pessoais em teste também são tratamento de dados (LGPD).

**Relatórios e logs** (k6, CI, monitores). Não coloque tokens em URLs ou em parâmetros de consulta; eles aparecem no relatório. Use cabeçalhos, lidos de variável de ambiente.

**Monitores sintéticos.** Conta dedicada, com o mínimo de permissão, e credencial rotacionável. Nunca a conta de uma pessoa.

## Valores públicos de teste

Alguns valores parecem secrets mas são públicos por definição, como as contas de teste do Hardhat. Liste cada um em `.claude/secrets-allowlist.txt` (para o hook) e na lista de exceções do scanner (para o CI), sempre com um comentário dizendo por que é seguro. Só o usuário decide o que entra na lista.

## Verifique

Antes de commitar algo gravado (HAR, fixture, trace), procure por `authorization`, `cookie`, `token`, `password`, e-mails e documentos no arquivo. Se o projeto tiver gitleaks, rode `gitleaks dir <arquivo>` antes do commit (ou `gitleaks detect --no-git --source <arquivo>` em versões anteriores à 8.19).
