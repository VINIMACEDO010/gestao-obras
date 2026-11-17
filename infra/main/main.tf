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
