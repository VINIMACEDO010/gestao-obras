# 003 - Orçamento

- **Status:** aprovada

## Contexto

O orçamento da obra é a lista de serviços contratados com quantidade e preço unitário. Ele é a base das medições.

## Requisitos funcionais

- RF01 - Cadastrar itens com código, descrição, unidade, quantidade e valor unitário.
- RF02 - Listar itens com o total de cada um e o total geral da obra.
- RF03 - Editar e excluir itens.

## Regras de negócio

- RN01 - Quantidade maior que zero e valor unitário maior ou igual a zero.
- RN02 - Item que já aparece em uma medição não pode ser excluído (o banco impede pela chave estrangeira).
- RN03 - Valores monetários usam `numeric`, nunca ponto flutuante.

## Requisitos de segurança

| ID | Requisito | ASVS | Como é verificado |
|----|-----------|------|-------------------|
| RS01 | Só `admin` e `escritorio` alteram o orçamento | V4.1.1 | `rbac.ts`, teste `integracao.test.ts` |
| RS02 | Cliente só lê o orçamento das obras vinculadas a ele | V4.2.1 | RLS, teste `integracao.test.ts` |
| RS03 | Toda alteração fica registrada na auditoria | V7.1.3 | trigger `app.auditar` |

## Critérios de aceite

- [ ] Dado um item com quantidade 0, quando salvo, então recebo 400.
