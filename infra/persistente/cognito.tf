# Identidade (spec 001): sem auto cadastro, MFA obrigatório, perfis por grupo.
# Fica na camada persistente: numa recuperação de desastre os usuários, senhas e MFA continuam valendo.
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

