# Política de segurança

## Como reportar uma vulnerabilidade

Não abra issue pública. Use **Security > Report a vulnerability** neste repositório (relato privado do GitHub). Responderemos em até 5 dias úteis.

## Práticas adotadas

- Toda funcionalidade tem uma spec com requisitos de segurança (`specs/`) e testes que os comprovam.
- Pull requests passam por SonarQube (SAST), Gitleaks, Trivy e Checkov antes do merge.
- Deploy só pela branch `main` protegida, com aprovação manual e credenciais temporárias via OIDC.
- Dados criptografados em repouso (KMS) e em trânsito (TLS obrigatório no RDS, S3 e SQS).
