mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = { names = ["us-east-1a", "us-east-1b", "us-east-1c"] }
  }
  mock_data "aws_region" {
    defaults = { name = "us-east-1" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/LabRole" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}" }
  }
  mock_resource "aws_db_instance" {
    defaults = {
      master_user_secret = [{ secret_arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:rds", kms_key_id = "k", secret_status = "active" }]
      resource_id        = "db-ABC"
      address            = "db.local"
      port               = 5432
    }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:123456789012:key/1" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:app" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::bucket" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/criado" }
  }
  mock_resource "aws_wafv2_web_acl" {
    defaults = { arn = "arn:aws:wafv2:us-east-1:123456789012:global/webacl/x/1" }
  }
  mock_resource "aws_cognito_user_pool" {
    defaults = { arn = "arn:aws:cognito-idp:us-east-1:123456789012:userpool/x", id = "us-east-1_X" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:123456789012:q", url = "https://sqs/q" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:x" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:us-east-1:123456789012:t" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/x/1" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/x/1", arn_suffix = "app/x/1", dns_name = "x.elb.amazonaws.com" }
  }
  mock_resource "aws_lb_listener" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/x/1/2" }
  }
  mock_resource "aws_apigatewayv2_api" {
    defaults = { api_endpoint = "https://abc123.execute-api.us-east-1.amazonaws.com", id = "abc123" }
  }
  mock_resource "aws_ecr_repository" {
    defaults = { repository_url = "123456789012.dkr.ecr.us-east-1.amazonaws.com/gestao-obras/x" }
  }
  mock_resource "aws_cognito_user_pool_client" {
    defaults = { id = "clienteteste" }
  }
  mock_resource "aws_ecs_cluster" {
    defaults = { arn = "arn:aws:ecs:us-east-1:123456789012:cluster/x" }
  }
  mock_resource "aws_ecs_task_definition" {
    defaults = { arn = "arn:aws:ecs:us-east-1:123456789012:task-definition/x:1" }
  }
}
mock_provider "http" {
  mock_data "http" {
    defaults = { response_body = "{\"keys\":[]}" }
  }
}
mock_provider "random" {}

variables {
  email_alertas      = "teste@exemplo.com"
  github_repositorio = "teste/gestao-obras"
}

run "learner_lab" {
  command = apply
  variables {
    learner_lab         = true
    rds_tipo_disco      = "gp2"
    habilitar_guardduty = false
    habilitar_orcamento = false
    criar_buckets       = false
  }
  assert {
    condition     = length(aws_iam_role.api) == 0 && length(aws_iam_role.github_deploy) == 0
    error_message = "Learner Lab não pode criar papéis IAM"
  }
  assert {
    condition     = aws_ecs_task_definition.api.task_role_arn == "arn:aws:iam::123456789012:role/LabRole"
    error_message = "Tarefa da API deve usar o LabRole"
  }
  assert {
    condition     = length(aws_secretsmanager_secret.app_db) == 1
    error_message = "Learner Lab usa senha do app_user no Secrets Manager"
  }
  assert {
    condition     = strcontains(aws_ecs_task_definition.api.container_definitions, "\"DB_PASSWORD\"") && strcontains(aws_ecs_task_definition.api.container_definitions, "APP_DB_PASSWORD")
    error_message = "API e migração precisam receber a senha"
  }
  assert {
    condition     = length(aws_s3_bucket.b) == 0 && length(aws_s3_bucket_versioning.b) == 2
    error_message = "Learner Lab: buckets fora do Terraform, configurações dentro"
  }
  assert {
    condition     = aws_db_instance.principal.storage_type == "gp2" && aws_db_instance.principal.multi_az == false
    error_message = "Learner Lab: gp2 e sem Multi-AZ"
  }
}

run "conta_normal" {
  command = apply
  assert {
    condition     = aws_lb.principal.internal == true
    error_message = "O ALB precisa ser interno (sem acesso direto da internet)"
  }
  assert {
    condition     = contains(aws_cognito_user_pool_client.web.callback_urls, "https://abc123.execute-api.us-east-1.amazonaws.com/callback")
    error_message = "Callback do Cognito deve apontar para o API Gateway"
  }
  assert {
    condition     = length(aws_iam_role.api) == 1 && length(aws_iam_role.github_deploy) == 1
    error_message = "Conta normal cria papéis próprios"
  }
  assert {
    condition     = length(aws_secretsmanager_secret.app_db) == 0 && !strcontains(aws_ecs_task_definition.api.container_definitions, "\"DB_PASSWORD\"")
    error_message = "Conta normal usa autenticação IAM no banco"
  }
}
