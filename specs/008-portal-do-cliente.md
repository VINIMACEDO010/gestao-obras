# 008 - Acompanhamento pelo cliente da obra

- **Status:** aprovada

## Contexto

O dono da obra quer acompanhar o andamento sem depender de ligações e mensagens.

## Requisitos funcionais

- RF01 - O cliente vê apenas as obras às quais foi vinculado.
- RF02 - Para cada obra ele vê: dados gerais, avanço do cronograma, diários com fotos validadas, orçamento e medições fechadas.
- RF03 - O cliente não altera nada.

## Requisitos de segurança

| ID | Requisito | ASVS | Como é verificado |
|----|-----------|------|-------------------|
| RS01 | Cliente só enxerga obras vinculadas, garantido no banco | V4.2.1 | políticas RLS restritivas; teste `integracao.test.ts` |
| RS02 | Cliente não consegue gravar em nenhuma tabela, nem chamando a API diretamente | V4.1.1 | RBAC + políticas RLS de escrita; teste `integracao.test.ts` |
| RS03 | Cliente não vê compras | V4.2.1 | RLS |
| RS04 | Cliente não vê medição em rascunho | V4.2.1 | política `cliente_so_fechadas`; teste `integracao.test.ts` |

## Critérios de aceite

- [ ] Dado um cliente vinculado à obra X, quando listo obras, então só vejo a obra X.
