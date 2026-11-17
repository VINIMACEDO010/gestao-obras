# 007 - Medições

- **Status:** aprovada

## Contexto

A medição registra quanto de cada item do orçamento foi executado em um período. É a base do faturamento da construtora para o cliente.

## Requisitos funcionais

- RF01 - Criar medição numerada em sequência por obra, com período (início e fim).
- RF02 - Informar a quantidade medida de cada item do orçamento.
- RF03 - Mostrar, por item, valor do período, quantidade acumulada e percentual acumulado.
- RF04 - Fechar a medição, o que gera o PDF pelo worker.

## Regras de negócio

- RN01 - A quantidade acumulada de um item (todas as medições) não pode passar da quantidade orçada.
- RN02 - Medição fechada não pode ser alterada.
- RN03 - Só existe uma medição em rascunho por obra.

## Requisitos de segurança

| ID | Requisito | ASVS | Como é verificado |
|----|-----------|------|-------------------|
| RS01 | Só `admin` e `escritorio` criam e fecham medições | V4.1.1 | `rbac.ts` |
| RS02 | Cliente só lê medições das obras dele | V4.2.1 | RLS |
| RS03 | Toda alteração de quantidade fica na auditoria com usuário e data | V7.1.3 | trigger `app.auditar` |
| RS04 | A regra RN01 é validada no servidor, dentro da transação | V11.1.2 | `routes/medicoes.ts` |

## Critérios de aceite

- [ ] Dado um item com 100 m² orçados e 80 m² já medidos, quando informo 30 m², então recebo 409 ao fechar.
