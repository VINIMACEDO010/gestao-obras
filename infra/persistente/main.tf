# Camada persistente: o que precisa sobreviver a um desastre ou a um terraform destroy do ambiente.
#   - chave KMS: sem ela os snapshots do banco e os documentos não podem ser lidos;
#   - Cognito (user pool, domínio de login e grupos): usuários, senhas e MFA.
# Aplicada uma vez e raramente alterada. O infra/main lê as saídas daqui via remote state.

data "aws_caller_identity" "atual" {}
data "aws_region" "atual" {}

locals {
  nome   = var.projeto
  conta  = data.aws_caller_identity.atual.account_id
  regiao = data.aws_region.atual.name
}
