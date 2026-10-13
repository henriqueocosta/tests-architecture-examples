# Pedido de teste para outro repositório

Use quando o teste certo mora em um repositório que você não mantém. Não edite o outro repositório: entregue o pedido como issue ou como descrição de PR para o time dono.

## Formato

```markdown
**Para:** <time ou repositório>
**Camada:** <contrato (provedor) | componente | E2E | ...>
**Por quê:** <o risco, em uma frase>

**O que já foi feito deste lado:** <teste escrito, arquivo e nome do teste>

**O que falta do seu lado:**
- <item verificável, com nomes exatos: provider state, campo, código de erro, rota>

**Como saber que terminou:** <comando ou verificação que fica verde>
```

## Exemplo: o front pediu um cenário novo à API

```markdown
**Para:** time da API
**Camada:** contrato (provedor)
**Por quê:** a tela precisa explicar ao usuário quando a cotação expirou.

**O que já foi feito deste lado:** interação "a request to swap using an expired quote"
no teste de consumidor (`tests/contract/consumer.test.ts`), esperando `410` com `error.code = "QUOTE_EXPIRED"`.

**O que falta do seu lado:**
- Provider state `an expired quote exists`, recebendo o parâmetro `quoteId`, que grava uma cotação já vencida.

**Como saber que terminou:** a verificação do provedor passa com o contrato novo.
```
