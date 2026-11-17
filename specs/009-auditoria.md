# 009 - Auditoria

- **Status:** aprovada

## Contexto

Orçamentos e medições envolvem dinheiro. É preciso saber quem alterou o quê e quando.

## Requisitos funcionais

- RF01 - Toda inclusão, alteração e exclusão nas tabelas de negócio gera um registro com empresa, usuário, tabela, id do registro, ação, dados antes e depois e data.
- RF02 - O `admin` consulta a auditoria da própria empresa pela API.

## Requisitos de segurança

| ID | Requisito | ASVS | Como é verificado |
|----|-----------|------|-------------------|
| RS01 | O registro é feito por trigger no banco, não depende da API lembrar de gravar | V7.1.3 | `001_schema.sql` |
| RS02 | O usuário da aplicação não tem permissão de UPDATE nem DELETE na auditoria | V7.3.3 | `GRANT` em `001_schema.sql`; teste `integracao.test.ts` |
| RS03 | Ações na conta AWS ficam no CloudTrail com validação de integridade dos arquivos | V7.3 | `observability.tf` |

## Critérios de aceite

- [ ] Dado que alterei um item do orçamento, quando consulto a auditoria, então vejo o valor antigo e o novo.
