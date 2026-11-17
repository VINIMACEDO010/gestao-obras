# 000 - Modelo de ameaças (STRIDE)

- **Status:** aprovada

## Ativos

- Dados das obras de cada construtora (orçamento, compras, medições), que têm valor comercial.
- Documentos e fotos do canteiro, que podem servir como prova em disputas contratuais.
- Credenciais de usuários e tokens de sessão.
- Credenciais de banco e chaves de criptografia.

## Fronteiras de confiança

1. Internet → API Gateway (HTTPS, limite de requisições).
2. API Gateway → ALB interno com WAF, pelo VPC Link (rede privada).
3. ALB → API na subnet privada.
4. API/worker → RDS na subnet de dados.
5. Navegador → S3 de documentos (upload direto por URL pré-assinada).
6. GitHub Actions → conta AWS (OIDC).

## Ameaças e mitigações

| ID | Categoria | Ameaça | Mitigação | Onde |
|----|-----------|--------|-----------|------|
| T01 | Spoofing | Força bruta ou credential stuffing no login | Cognito com MFA obrigatório, senha mínima de 12 caracteres, WAF regional no user pool com limite de taxa | `infra/main/cognito.tf`, `waf.tf` |
| T02 | Spoofing | Token forjado ou de outro app | API valida assinatura (JWKS), emissor, `client_id` e expiração | `api/src/auth.ts` |
| T03 | Tampering | Usuário alterar o próprio `custom:empresa_id` para entrar em outra empresa | Atributo fora da lista `write_attributes` do app client; só admin define via script | `cognito.tf` |
| T04 | Information disclosure | Usuário de uma construtora ver dados de outra (IDOR) | Row Level Security no PostgreSQL por `empresa_id`, além do filtro na API | `api/migrations/001_schema.sql`, teste `integracao.test.ts` |
| T05 | Information disclosure | Cliente da obra ver obras de outros clientes ou compras internas | Políticas RLS restritivas para o perfil `cliente` | `001_schema.sql`, teste `integracao.test.ts` |
| T06 | Elevation of privilege | Perfil `canteiro` aprovar compras ou fechar medição | RBAC por rota na API com base no grupo do Cognito | `api/src/rbac.ts`, teste `integracao.test.ts` |
| T07 | Tampering | Upload de arquivo malicioso disfarçado de foto | Upload só por POST pré-assinado com tipo e tamanho máximos; worker confere a assinatura binária do arquivo e apaga o que não for JPEG/PNG | `api/src/routes/diarios.ts`, `worker/src/jobs.ts` |
| T08 | Information disclosure | Acesso público a fotos e documentos | Bucket privado, bloqueio de acesso público, KMS, URLs pré-assinadas de 5 minutos | `s3.tf` |
| T09 | Tampering | SQL injection | Consultas parametrizadas em toda a API, WAF com regras de SQLi, SAST no SonarQube | `api/src`, `waf.tf`, CI |
| T10 | Repudiation | Usuário negar que alterou um valor de medição | Tabela de auditoria preenchida por trigger, sem permissão de alteração para a aplicação | `001_schema.sql` |
| T11 | Denial of service | Excesso de requisições à API | Limite de requisições no API Gateway, WAF com limite por IP real (X-Forwarded-For), ECS em 2 AZs, alarmes | `apigateway.tf`, `waf.tf`, `observability.tf` |
| T12 | Information disclosure | Vazamento de senha do banco | API e worker usam autenticação IAM no RDS (sem senha); senha mestre só no Secrets Manager com rotação | `rds.tf`, `api/src/db.ts` |
| T13 | Spoofing | Acesso direto ao ALB pulando a borda | ALB interno, sem endereço público, em subnet sem rota para a internet; SG aceita só o VPC Link do API Gateway | `alb.tf`, `security_groups.tf`, teste `tests/modos.tftest.hcl` |
| T14 | Tampering | Segredo commitado no repositório | Gitleaks no CI, secret scanning do GitHub, OIDC sem chaves fixas | `.github/workflows` |
| T15 | Tampering | Dependência vulnerável | Dependabot e Trivy bloqueando HIGH/CRITICAL | CI |
| T16 | Elevation of privilege | Infraestrutura insegura por configuração | Checkov no CI e `terraform apply` só com aprovação | CI |
