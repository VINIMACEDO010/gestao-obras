# Entrega do trabalho semestral: Sistema de Gestão de Obras

Disciplina: Auditoria e Segurança de Sistemas (UNIDAVI) · Prof. Fabiano

Equipe: Vinicius, Misael, Paulo e Josué

Repositório: https://github.com/VINIMACEDO010/gestao-obras

O Sistema de Gestão de Obras é um SaaS multiempresa para construtoras. Ele reúne orçamento, cronograma, compras, diário de obra com fotos, medições com boletim em PDF e um portal para o cliente da obra. Este documento mostra onde cada requisito do trabalho está atendido no repositório.

## Requisitos e onde verificar

| Requisito | Como foi atendido | Onde ver |
|---|---|---|
| Fluxo de desenvolvimento completo, CI/CD com SAST | Especificação e modelo de ameaças por módulo; pull request com checklist de segurança; CI com 36 testes, SonarQube Cloud (SAST), Gitleaks, Trivy, checkov e actionlint; deploy com aprovação manual, varredura da imagem e smoke test | `specs/`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.github/workflows/terraform-plan.yml`, `sonar-project.properties`, `.github/pull_request_template.md` |
| Terraform representando o plano de DR | Toda a infraestrutura em código, em duas camadas: `persistente` (KMS e Cognito, fora do destroy) e `main` (ambiente recriável). Snapshot final automático do banco e restauração por variável. RTO de 1 hora; RPO zero em destroy controlado e de 5 minutos com PITR. Cenário de DR coberto por `terraform test` | `infra/persistente/`, `infra/main/`, `infra/main/rds.tf`, `infra/main/tests/modos.tftest.hcl`, `docs/plano-de-recuperacao-de-desastres.md` |
| Segmentação de redes | VPC 10.20.0.0/16 em 2 zonas, sem subnet pública, sem Internet Gateway e sem NAT. Camada de aplicação (10.20.10.0/24 e 10.20.11.0/24) e de dados isolada (10.20.20.0/24 e 10.20.21.0/24) com NACL. Security groups encadeados: cada camada só aceita a anterior. Serviços da AWS por VPC endpoints e VPC Flow Logs ativos | `infra/main/network.tf`, `infra/main/security_groups.tf`, `infra/main/endpoints.tf` |
| Controladores de carga com WAF | API Gateway como única entrada HTTPS, ligado por VPC Link a um ALB interno. WAF regional no ALB (regras gerenciadas OWASP, SQL injection, entradas maliciosas e limite por IP). Segundo WAF no login do Cognito (reputação de IP e limite de tentativas) | `infra/main/apigateway.tf`, `infra/main/alb.tf`, `infra/main/waf.tf` |
| Aplicação funcional | API Node.js/TypeScript, frontend React (PWA) e worker de processamento. Login com MFA, quatro perfis de acesso, isolamento entre empresas no banco (RLS) e auditoria de alterações | `api/`, `web/`, `worker/`, `api/migrations/001_schema.sql`, `api/test/`, `docs/evidencias/sistema/` |

## Arquitetura

O diagrama atualizado está em `docs/arquitetura/arquitetura-gestao-obras.pdf`; a versão editável é `docs/arquitetura/arquitetura-gestao-obras.drawio` (abre no diagrams.net).

A arquitetura da primeira entrega previa CloudFront, Route 53 e subnets públicas com o ALB exposto. O ambiente AWS Academy Learner Lab bloqueia CloudFront, Route 53 e a criação de roles IAM. Por isso, a entrada HTTPS passou para o API Gateway, ligado por VPC Link a um ALB interno protegido por WAF regional. Com isso a VPC ficou sem nenhum recurso público, o que reduz a superfície de ataque em relação ao desenho original.

## Evidências

- `docs/evidencias/sistema/`: telas do sistema funcionando (escritório, canteiro no celular, cliente, isolamento entre empresas, auditoria e PDF da medição).
- `docs/evidencias/pipeline/`: execuções do GitHub Actions e análise do SonarQube Cloud.
- `docs/evidencias/aws/`: ambiente na AWS e WAF bloqueando SQL injection com erro 403.

## Como executar

As instruções completas de execução local, provisionamento com Terraform e deploy estão no `README.md`.
