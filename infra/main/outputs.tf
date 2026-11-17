output "url_site" {
  value = local.url_site
}

output "bucket_documentos" {
  value = local.bucket["documentos"].bucket
}

output "ecr_api" {
  value = aws_ecr_repository.img["api"].repository_url
}

output "ecr_worker" {
  value = aws_ecr_repository.img["worker"].repository_url
}

output "cluster_ecs" {
  value = aws_ecs_cluster.principal.name
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.usuarios.id
}

# Configuração de login (o frontend busca em /api/config)
output "cognito_authority" {
  value = local.cognito_authority
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "cognito_domain" {
  value = local.cognito_dominio_url
}

output "rds_endpoint" {
  value = aws_db_instance.principal.address
}

output "fila_jobs" {
  value = aws_sqs_queue.jobs.url
}

output "papel_github_deploy" {
  value = try(aws_iam_role.github_deploy[0].arn, "nao se aplica (Learner Lab)")
}

output "papel_github_plano" {
  value = try(aws_iam_role.github_plano[0].arn, "nao se aplica (Learner Lab)")
}

# Usados por scripts/criar-empresa.sh
output "subnets_app" {
  value = join(",", aws_subnet.app[*].id)
}

output "sg_api" {
  value = aws_security_group.api.id
}
