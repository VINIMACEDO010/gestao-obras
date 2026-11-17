# Especificações (SDD)

Neste projeto toda funcionalidade nasce de uma especificação. O código só é escrito depois que a spec existe e foi revisada.

## Fluxo

1. Copie `_template.md` para `NNN-nome-da-funcionalidade.md`.
2. Preencha requisitos, critérios de aceite e **requisitos de segurança** (referência OWASP ASVS 4.0.3).
3. Revise as ameaças da funcionalidade no `000-modelo-de-ameacas.md` (STRIDE) e acrescente as novas.
4. Abra um PR só com a spec. Depois de aprovada, o código é feito em outro PR que cita a spec.
5. Cada requisito de segurança deve ter um teste automatizado ou uma regra de infraestrutura que o comprove (coluna "Como é verificado").

## Índice

| Nº | Spec | Status |
|----|------|--------|
| 000 | [Modelo de ameaças (STRIDE)](000-modelo-de-ameacas.md) | Aprovada |
| 001 | [Autenticação e perfis](001-autenticacao-e-perfis.md) | Aprovada |
| 002 | [Obras e isolamento entre empresas](002-obras-e-isolamento.md) | Aprovada |
| 003 | [Orçamento](003-orcamento.md) | Aprovada |
| 004 | [Cronograma](004-cronograma.md) | Aprovada |
| 005 | [Compras](005-compras.md) | Aprovada |
| 006 | [Diário de obra com fotos](006-diario-de-obra.md) | Aprovada |
| 007 | [Medições](007-medicoes.md) | Aprovada |
| 008 | [Acompanhamento pelo cliente da obra](008-portal-do-cliente.md) | Aprovada |
| 009 | [Auditoria](009-auditoria.md) | Aprovada |

## Matriz de permissões (RBAC)

| Recurso | admin | escritorio | canteiro | cliente |
|---|---|---|---|---|
| Obras | criar, editar, excluir | criar, editar | ler | ler (só as dele) |
| Clientes vinculados à obra | gerenciar | gerenciar | - | - |
| Orçamento | gerenciar | gerenciar | - | ler (só as dele) |
| Cronograma | gerenciar | gerenciar | ler | ler (só as dele) |
| Compras | gerenciar e aprovar | gerenciar e aprovar | solicitar e ler | - |
| Diário de obra | gerenciar | gerenciar | criar, editar, fechar | ler (só as dele) |
| Fotos do diário | enviar e ver | enviar e ver | enviar e ver | ver (só as dele) |
| Medições | gerenciar e fechar | gerenciar e fechar | - | ler (só as dele) |
| Usuários da empresa | listar | listar | - | - |
| Auditoria | ler | - | - | - |
