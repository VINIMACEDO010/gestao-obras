# Papéis das tarefas ECS com o mínimo de permissões necessário.
# No Learner Lab não é permitido criar papéis: as tarefas usam o LabRole pré-criado.

data "aws_iam_role" "lab" {
  count = var.learner_lab ? 1 : 0
  name  = "LabRole"
}

locals {
  confianca_ecs = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = local.conta } }
    }]
  })
  # Conexão IAM ao RDS como app_user (sem senha)
  rds_app_user_arn = "arn:aws:rds-db:${local.regiao}:${local.conta}:dbuser:${aws_db_instance.principal.resource_id}/app_user"
  docs_arn         = local.bucket["documentos"].arn
}

# Execução: baixar imagem, gravar log e ler o segredo do migrador
resource "aws_iam_role" "execucao" {
  count              = var.learner_lab ? 0 : 1
  name               = "${local.nome}-ecs-execucao"
  assume_role_policy = local.confianca_ecs
}

resource "aws_iam_role_policy_attachment" "execucao" {
  count      = var.learner_lab ? 0 : 1
  role       = aws_iam_role.execucao[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execucao_segredo" {
  count = var.learner_lab ? 0 : 1
  role  = aws_iam_role.execucao[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = compact([aws_db_instance.principal.master_user_secret[0].secret_arn, try(aws_secretsmanager_secret.app_db[0].arn, "")])
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = local.kms_arn
      },
    ]
  })
}

resource "aws_iam_role" "api" {
  count              = var.learner_lab ? 0 : 1
  name               = "${local.nome}-api"
  assume_role_policy = local.confianca_ecs
}

resource "aws_iam_role_policy" "api" {
  count = var.learner_lab ? 0 : 1
  role  = aws_iam_role.api[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = "rds-db:connect", Resource = local.rds_app_user_arn },
      # PutObject é usado na assinatura do POST pré-assinado; GetObject nos links temporários
      { Effect = "Allow", Action = ["s3:PutObject", "s3:GetObject"], Resource = "${local.docs_arn}/*" },
      { Effect = "Allow", Action = "sqs:SendMessage", Resource = aws_sqs_queue.jobs.arn },
      { Effect = "Allow", Action = ["kms:GenerateDataKey", "kms:Decrypt"], Resource = local.kms_arn },
    ]
  })
}

resource "aws_iam_role" "worker" {
  count              = var.learner_lab ? 0 : 1
  name               = "${local.nome}-worker"
  assume_role_policy = local.confianca_ecs
}

resource "aws_iam_role_policy" "worker" {
  count = var.learner_lab ? 0 : 1
  role  = aws_iam_role.worker[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = "rds-db:connect", Resource = local.rds_app_user_arn },
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${local.docs_arn}/*" },
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.jobs.arn
      },
      { Effect = "Allow", Action = ["kms:GenerateDataKey", "kms:Decrypt"], Resource = local.kms_arn },
    ]
  })
}

locals {
  papel_execucao = var.learner_lab ? data.aws_iam_role.lab[0].arn : aws_iam_role.execucao[0].arn
  papel_api      = var.learner_lab ? data.aws_iam_role.lab[0].arn : aws_iam_role.api[0].arn
  papel_worker   = var.learner_lab ? data.aws_iam_role.lab[0].arn : aws_iam_role.worker[0].arn
}
