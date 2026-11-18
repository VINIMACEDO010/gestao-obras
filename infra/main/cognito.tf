# App client do frontend. O user pool fica na camada persistente (infra/persistente).
resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.nome}-web"
  user_pool_id = local.cognito_pool_id

  # SPA: cliente público com Authorization Code + PKCE
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = [for u in local.urls_site : "${u}/callback"]
  logout_urls                          = [for u in local.urls_site : "${u}/"]
  explicit_auth_flows                  = ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  # O usuário lê mas NÃO pode alterar a própria empresa (spec 001 RS02)
  read_attributes  = ["email", "email_verified", "name", "custom:empresa_id"]
  write_attributes = ["email", "name"]

  id_token_validity      = 60
  access_token_validity  = 60
  refresh_token_validity = 12
  token_validity_units {
    id_token      = "minutes"
    access_token  = "minutes"
    refresh_token = "hours"
  }
}

# Chaves públicas do user pool, entregues à API como variável de ambiente
# (a API não tem saída para a internet para buscá-las)
data "http" "jwks" {
  url = "https://cognito-idp.${local.regiao}.amazonaws.com/${local.cognito_pool_id}/.well-known/jwks.json"
  request_headers = {
    Accept = "application/json"
  }
}

locals {
  cognito_authority = "https://cognito-idp.${local.regiao}.amazonaws.com/${local.cognito_pool_id}"
}
