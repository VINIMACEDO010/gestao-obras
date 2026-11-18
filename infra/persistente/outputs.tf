output "kms_arn" {
  value = aws_kms_key.principal.arn
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.usuarios.id
}

output "cognito_user_pool_arn" {
  value = aws_cognito_user_pool.usuarios.arn
}

output "cognito_dominio_url" {
  value = "https://${aws_cognito_user_pool_domain.login.domain}.auth.${local.regiao}.amazoncognito.com"
}
