resource "aws_ecs_cluster" "principal" {
  name = local.nome
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "ecs" {
  for_each          = toset(["api", "worker"])
  name              = "/ecs/${local.nome}/${each.key}"
  retention_in_days = 365
  kms_key_id        = local.kms_arn
}

locals {
  imagem_api    = "${aws_ecr_repository.img["api"].repository_url}:${var.imagem_tag}"
  imagem_worker = "${aws_ecr_repository.img["worker"].repository_url}:${var.imagem_tag}"
  segredo_db    = aws_db_instance.principal.master_user_secret[0].secret_arn

  env_comum = [
    { name = "NODE_ENV", value = "production" },
    { name = "AWS_REGION", value = local.regiao },
    { name = "DB_HOST", value = aws_db_instance.principal.address },
    { name = "DB_PORT", value = tostring(aws_db_instance.principal.port) },
    { name = "DB_NAME", value = aws_db_instance.principal.db_name },
    { name = "DB_USER", value = "app_user" },
    { name = "DB_IAM_AUTH", value = tostring(local.db_auth_iam) },
    { name = "DB_SSL", value = "true" },
    { name = "DOCS_BUCKET", value = local.bucket["documentos"].bucket },
    { name = "DOCS_KMS_KEY_ID", value = local.kms_arn },
    { name = "JOBS_QUEUE_URL", value = aws_sqs_queue.jobs.url },
  ]

  # Senha do app_user (só quando não há autenticação IAM no banco)
  segredo_app_senha = local.db_auth_iam ? [] : [
    { name = "DB_PASSWORD", valueFrom = aws_secretsmanager_secret.app_db[0].arn },
  ]
  segredo_migracao_app = local.db_auth_iam ? [] : [
    { name = "APP_DB_PASSWORD", valueFrom = aws_secretsmanager_secret.app_db[0].arn },
  ]

  log = { for k, g in aws_cloudwatch_log_group.ecs : k => {
    logDriver = "awslogs"
    options   = { "awslogs-group" = g.name, "awslogs-region" = local.regiao, "awslogs-stream-prefix" = k }
  } }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.nome}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = local.papel_execucao
  task_role_arn            = local.papel_api
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([
    {
      # Contêiner de inicialização: aplica as migrações e termina.
      # A API só sobe se ele terminar com sucesso.
      name                   = "migracao"
      image                  = local.imagem_api
      essential              = false
      command                = ["node", "dist/migrate.js"]
      readonlyRootFilesystem = true
      user                   = "node"
      environment            = local.env_comum
      secrets = concat([
        { name = "MIGRATE_DB_USER", valueFrom = "${local.segredo_db}:username::" },
        { name = "MIGRATE_DB_PASSWORD", valueFrom = "${local.segredo_db}:password::" },
      ], local.segredo_migracao_app)
      logConfiguration = local.log["api"]
    },
    {
      name                   = "api"
      image                  = local.imagem_api
      essential              = true
      readonlyRootFilesystem = true
      user                   = "node"
      portMappings           = [{ containerPort = local.porta_api, protocol = "tcp" }]
      dependsOn              = [{ containerName = "migracao", condition = "SUCCESS" }]
      secrets                = local.segredo_app_senha
      environment = concat(local.env_comum, [
        { name = "PORT", value = tostring(local.porta_api) },
        { name = "AUTH_MODE", value = "cognito" },
        { name = "COGNITO_USER_POOL_ID", value = local.cognito_pool_id },
        { name = "COGNITO_CLIENT_ID", value = aws_cognito_user_pool_client.web.id },
        { name = "COGNITO_JWKS", value = data.http.jwks.response_body },
        { name = "COGNITO_DOMAIN", value = local.cognito_dominio_url },
      ])
      healthCheck = {
        command     = ["CMD-SHELL", "wget -qO- http://127.0.0.1:${local.porta_api}/api/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
      logConfiguration = local.log["api"]
    },
  ])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.nome}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = local.papel_execucao
  task_role_arn            = local.papel_worker
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name                   = "worker"
    image                  = local.imagem_worker
    essential              = true
    readonlyRootFilesystem = true
    user                   = "node"
    environment            = local.env_comum
    secrets                = local.segredo_app_senha
    logConfiguration       = local.log["worker"]
  }])
}

resource "aws_ecs_service" "api" {
  name                              = "api"
  cluster                           = aws_ecs_cluster.principal.id
  task_definition                   = aws_ecs_task_definition.api.arn
  desired_count                     = var.api_quantidade
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 90
  propagate_tags                    = "SERVICE"

  network_configuration {
    subnets          = aws_subnet.app[*].id
    security_groups  = [aws_security_group.api.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = local.porta_api
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  depends_on = [aws_lb_listener.principal]
}

resource "aws_ecs_service" "worker" {
  name            = "worker"
  cluster         = aws_ecs_cluster.principal.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = 1
  launch_type     = "FARGATE"
  propagate_tags  = "SERVICE"

  network_configuration {
    subnets          = aws_subnet.app[*].id
    security_groups  = [aws_security_group.worker.id]
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
}

# Escala a API de 2 até 4 tarefas pela CPU
resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.principal.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.api_quantidade
  max_capacity       = var.api_quantidade * 2
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.nome}-api-cpu"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  policy_type        = "TargetTrackingScaling"
  target_tracking_scaling_policy_configuration {
    target_value = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# Tarefa avulsa de administração (cadastro de construtora). Não fica rodando:
# é disparada por scripts/criar-empresa.sh e termina em seguida.
resource "aws_ecs_task_definition" "admin" {
  family                   = "${local.nome}-admin"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = local.papel_execucao
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name                   = "admin"
    image                  = local.imagem_api
    essential              = true
    command                = ["node", "dist/migrate.js"]
    readonlyRootFilesystem = true
    user                   = "node"
    environment            = local.env_comum
    secrets = [
      { name = "MIGRATE_DB_USER", valueFrom = "${local.segredo_db}:username::" },
      { name = "MIGRATE_DB_PASSWORD", valueFrom = "${local.segredo_db}:password::" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.ecs["api"].name
        "awslogs-region"        = local.regiao
        "awslogs-stream-prefix" = "admin"
      }
    }
  }])
}
