# Matchers do Pact (MatchersV3)

| No contrato | Significa | Use quando |
|---|---|---|
| `from: "TKA"` | O valor tem de ser exatamente esse | O front depende do valor (status, enum, eco do pedido) |
| `like("199.4")` | Basta ser do mesmo tipo | Valores calculados, textos de mensagem |
| `uuid(...)` | Basta ser um UUID | Identificadores |
| `regex(/^0x[0-9a-f]{64}$/, "0xab…")` | Basta casar com a expressão | Hashes, endereços, formatos próprios |
| `iso8601DateTimeWithMillis(...)` | Basta ser uma data ISO com milissegundos | Datas |
| `eachLike({ ... })` | Lista com pelo menos um item nesse formato | Listas e históricos |

## Como o provedor interpreta

| Na resposta real | Resultado |
|---|---|
| Campo a mais | Passa: a API pode acrescentar campos |
| Campo a menos ou renomeado | Falha: "Actual map is missing the following keys" |
| Tipo diferente (número em vez de string) | Falha |
| Valor diferente com `like` | Passa |
| Valor diferente sem matcher | Falha |

## Corpo de erro padrão

Todos os erros da API seguem `{ error: { code, message } }`. Fixe o `code` (o front escolhe a mensagem por ele) e use `like` na `message`:

```ts
const errorBody = (code: string, message: string) => ({ error: { code, message: like(message) } });
```
