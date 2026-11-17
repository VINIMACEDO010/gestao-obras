## O que muda

## Spec relacionada

- [ ] `specs/NNN-...md` (obrigatório para funcionalidade nova)

## Checklist de segurança

- [ ] Requisitos de segurança da spec implementados e com teste
- [ ] Entradas novas validadas com zod (`.strict()` no corpo)
- [ ] Rotas novas com `exigir(...)` conforme a matriz de permissões
- [ ] Tabelas novas com `empresa_id`, RLS (`enable` + `force`) e trigger de auditoria
- [ ] Nenhum segredo, token ou dado pessoal em código ou log
- [ ] CI verde (testes, SonarQube, Gitleaks, Trivy, Checkov)
