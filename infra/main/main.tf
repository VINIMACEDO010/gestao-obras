data "aws_caller_identity" "atual" {}
data "aws_region" "atual" {}

data "aws_availability_zones" "disponiveis" {
  #checkov:skip=CKV_AWS_394:Usamos só as duas primeiras AZs em ordem alfabética, que não mudam
  state = "available"
}

locals {
  nome   = var.projeto
  conta  = data.aws_caller_identity.atual.account_id
  regiao = data.aws_region.atual.name
  azs    = slice(data.aws_availability_zones.disponiveis.names, 0, 2)

  # Endereço público do sistema (HTTPS do API Gateway)
  url_site  = aws_apigatewayv2_api.borda.api_endpoint
  urls_site = concat([local.url_site], var.urls_dev)

  porta_api = 3000
}

# ---------------------------------------------------------------------------
# Camada persistente (infra/persistente): chave KMS e identidade (Cognito).
# Não é apagada no terraform destroy deste diretório, o que permite recuperar
# o ambiente a partir dos snapshots do banco (plano de DR em docs/).
# ---------------------------------------------------------------------------
data "terraform_remote_state" "persistente" {
  backend = "s3"
  config = {
    bucket = var.estado_bucket != "" ? var.estado_bucket : "${var.projeto}-tfstate-${data.aws_caller_identity.atual.account_id}"
    key    = "persistente/terraform.tfstate"
    region = var.regiao
  }
}

locals {
  kms_arn             = data.terraform_remote_state.persistente.outputs.kms_arn
  cognito_pool_id     = data.terraform_remote_state.persistente.outputs.cognito_user_pool_id
  cognito_pool_arn    = data.terraform_remote_state.persistente.outputs.cognito_user_pool_arn
  cognito_dominio_url = data.terraform_remote_state.persistente.outputs.cognito_dominio_url
}
