# 004 - Cronograma

- **Status:** aprovada

## Contexto

O cronograma lista as etapas da obra com datas previstas e percentual concluído. O cliente usa essa informação para acompanhar o andamento.

## Requisitos funcionais

- RF01 - Cadastrar etapas com nome, ordem, data de início, data de fim e percentual concluído.
- RF02 - Listar etapas em ordem e calcular o avanço geral da obra (média ponderada pela duração das etapas).
- RF03 - Editar e excluir etapas.

## Regras de negócio

- RN01 - Data de fim maior ou igual à data de início.
- RN02 - Percentual entre 0 e 100.

## Requisitos de segurança

| ID | Requisito | ASVS | Como é verificado |
|----|-----------|------|-------------------|
| RS01 | Só `admin` e `escritorio` alteram o cronograma | V4.1.1 | `rbac.ts` |
| RS02 | Cliente só vê o cronograma das obras dele | V4.2.1 | RLS |

## Critérios de aceite

- [ ] Dado uma etapa com fim antes do início, quando salvo, então recebo 400.
