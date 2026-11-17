# Autenticação (spec 001): sem auto cadastro, MFA obrigatório, perfis por grupo
resource "aws_cognito_user_pool" "usuarios" {
  name                     = "${local.nome}-usuarios"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = var.protecao_exclusao ? "ACTIVE" : "INACTIVE"

  mfa_configuration = "ON"
  software_token_mfa_configuration {
    enabled = true
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 3
  }

  # Só o administrador cria usuários (scripts/criar-usuario.sh)
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  schema {
    name                = "empresa_id"
    attribute_data_type = "String"
    mutable             = true
    required            = false
    string_attribute_constraints {
      min_length = 36
      max_length = 36
    }
  }

  lifecycle {
    ignore_changes = [schema]
  }
}

resource "random_id" "dominio_cognito" {
  byte_length = 4
}

resource "aws_cognito_user_pool_domain" "login" {
  domain       = "${local.nome}-${random_id.dominio_cognito.hex}"
  user_pool_id = aws_cognito_user_pool.usuarios.id
}

resource "aws_cognito_user_group" "perfis" {
  for_each = {
    admin      = { p = 1, d = "Administrador da construtora" }
    escritorio = { p = 2, d = "Equipe do escritório" }
    canteiro   = { p = 3, d = "Encarregado ou mestre de obras" }
    cliente    = { p = 4, d = "Cliente da obra (somente leitura)" }
  }
  name         = each.key
  precedence   = each.value.p
  description  = each.value.d
  user_pool_id = aws_cognito_user_pool.usuarios.id
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.nome}-web"
  user_pool_id = aws_cognito_user_pool.usuarios.id

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
  url = "https://cognito-idp.${local.regiao}.amazonaws.com/${aws_cognito_user_pool.usuarios.id}/.well-known/jwks.json"
  request_headers = {
    Accept = "application/json"
  }
}

locals {
  cognito_dominio_url = "https://${aws_cognito_user_pool_domain.login.domain}.auth.${local.regiao}.amazoncognito.com"
  cognito_authority   = "https://cognito-idp.${local.regiao}.amazonaws.com/${aws_cognito_user_pool.usuarios.id}"
}
