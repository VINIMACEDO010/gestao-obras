# 005 - Compras

- **Status:** aprovada

## Contexto

O canteiro solicita materiais e o escritório aprova e acompanha o recebimento.

## Requisitos funcionais

- RF01 - Criar solicitação de compra com descrição, quantidade, unidade, fornecedor (opcional), valor estimado e data de necessidade.
- RF02 - Fluxo de status: `solicitada` → `aprovada` → `recebida`, ou `cancelada` a partir de `solicitada` ou `aprovada`.
- RF03 - Registrar quem solicitou e quem aprovou.

## Regras de negócio

- RN01 - Transições fora do fluxo são recusadas (409).
- RN02 - Só compras `solicitada` podem ser excluídas.

## Requisitos de segurança

| ID | Requisito | ASVS | Como é verificado |
|----|-----------|------|-------------------|
| RS01 | `canteiro` solicita mas não aprova | V4.1.1 | `rbac.ts`, teste `integracao.test.ts` |
| RS02 | Cliente da obra não vê compras (custos internos) | V4.2.1 | política RLS restritiva, teste `integracao.test.ts` |
| RS03 | O aprovador é gravado a partir do token, nunca do corpo | V4.1.3 | `routes/compras.ts` |

## Critérios de aceite

- [ ] Dado um usuário `canteiro`, quando tento aprovar uma compra, então recebo 403.
- [ ] Dado uma compra `recebida`, quando tento cancelar, então recebo 409.
