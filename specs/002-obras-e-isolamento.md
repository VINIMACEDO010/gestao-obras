# 002 - Obras e isolamento entre empresas

- **Status:** aprovada

## Contexto

O sistema é um SaaS: várias construtoras usam a mesma instalação. A obra é a entidade central e todo o resto (orçamento, cronograma, compras, diário, medições) pertence a uma obra.

## Requisitos funcionais

- RF01 - Cadastrar, listar, editar e excluir obras (código, nome, endereço, nome do cliente, status, datas de início e de término prevista).
- RF02 - Vincular usuários do perfil `cliente` a uma obra.
- RF03 - Status possíveis: `planejada`, `em_andamento`, `paralisada`, `concluida`.

## Regras de negócio

- RN01 - O código da obra é único dentro da empresa.
- RN02 - A data de término prevista não pode ser anterior à de início.
- RN03 - Só `admin` exclui obra. A exclusão remove os dados ligados a ela.

## Requisitos de segurança

| ID | Requisito | ASVS | Como é verificado |
|----|-----------|------|-------------------|
| RS01 | Uma empresa nunca lê nem altera dados de outra, mesmo que a API tenha um bug de filtro | V4.2.1 | RLS com `FORCE ROW LEVEL SECURITY`; teste `integracao.test.ts` |
| RS02 | O `empresa_id` vem sempre do token, nunca do corpo da requisição | V4.2.1 | `db.ts` define o contexto; rotas não aceitam o campo |
| RS03 | Acesso a obra de outra empresa responde 404, sem confirmar que ela existe | V4.2.1 | teste `integracao.test.ts` |
| RS04 | Entradas validadas por esquema (tipos, tamanhos, formatos) | V5.1.3 | `zod` nas rotas |

## Critérios de aceite

- [ ] Dado um usuário da empresa A, quando consulto `/api/obras/{id}` de uma obra da empresa B, então recebo 404.
- [ ] Dado um usuário `canteiro`, quando tento criar uma obra, então recebo 403.
