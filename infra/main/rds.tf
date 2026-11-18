resource "aws_db_subnet_group" "dados" {
  name       = "${local.nome}-dados"
  subnet_ids = aws_subnet.dados[*].id
}

resource "aws_db_parameter_group" "postgres" {
  name   = "${local.nome}-pg16"
  family = "postgres16"

  # Recusa conexões sem TLS
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_connections"
    value = "1"
  }
  parameter {
    name  = "log_disconnections"
    value = "1"
  }
  # Registra comandos que alteram estrutura (DDL)
  parameter {
    name  = "log_statement"
    value = "ddl"
  }
}

resource "aws_db_instance" "principal" {
  #checkov:skip=CKV_AWS_118:Monitoramento avançado gera custo extra; métricas básicas e alarmes estão no CloudWatch
  #checkov:skip=CKV_AWS_353:Performance Insights opcional em ambiente acadêmico
  #checkov:skip=CKV_AWS_157:Multi-AZ controlado pela variável rds_multi_az por causa do custo
  #checkov:skip=CKV_AWS_293:Proteção contra exclusão controlada pela variável protecao_exclusao
  #checkov:skip=CKV2_AWS_60:Cópia de tags para snapshot já habilitada
  identifier     = "${local.nome}-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.rds_classe
  db_name        = "obras"

  # Senha mestre gerada e rotacionada pelo próprio RDS no Secrets Manager.
  # Só a migração usa; API e worker entram com token IAM (usuário app_user, sem senha).
  username                            = "obras_admin"
  manage_master_user_password         = true
  master_user_secret_kms_key_id       = local.kms_arn
  iam_database_authentication_enabled = true

  allocated_storage     = 20
  max_allocated_storage = 50
  storage_type          = var.rds_tipo_disco
  storage_encrypted     = true
  kms_key_id            = local.kms_arn

  db_subnet_group_name   = aws_db_subnet_group.dados.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = var.rds_multi_az
  parameter_group_name   = aws_db_parameter_group.postgres.name
  ca_cert_identifier     = "rds-ca-rsa2048-g1"

  backup_retention_period = 7
  copy_tags_to_snapshot   = true
  deletion_protection     = var.protecao_exclusao

  # Recuperação de desastre (docs/plano-de-recuperacao-de-desastres.md):
  # - todo destroy guarda um snapshot final com data e hora no nome;
  # - os backups automáticos (restauração até um ponto no tempo) continuam guardados;
  # - com restaurar_snapshot preenchido, o banco nasce a partir do snapshot, com os dados.
  skip_final_snapshot             = false
  final_snapshot_identifier       = "${local.nome}-final-${formatdate("YYYYMMDD-hhmm", timestamp())}"
  delete_automated_backups        = false
  snapshot_identifier             = var.restaurar_snapshot != "" ? var.restaurar_snapshot : null
  auto_minor_version_upgrade      = true
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  apply_immediately               = true

  lifecycle {
    # O nome do snapshot final é fixado na criação; e depois de restaurado o banco
    # não deve ser recriado só porque a variável voltou a ficar vazia.
    ignore_changes = [final_snapshot_identifier, snapshot_identifier]
  }
}

locals {
  # Conta normal: API e worker entram no banco com token IAM, sem senha.
  # Learner Lab: o LabRole não garante rds-db:connect, então usa senha guardada no Secrets Manager.
  db_auth_iam = !var.learner_lab
}

resource "random_password" "app_db" {
  count   = local.db_auth_iam ? 0 : 1
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "app_db" {
  #checkov:skip=CKV2_AWS_57:Rotação automática exige Lambda com papel IAM, indisponível no Learner Lab
  count                   = local.db_auth_iam ? 0 : 1
  name                    = "${local.nome}/app-db-senha"
  description             = "Senha do usuário app_user do PostgreSQL"
  kms_key_id              = local.kms_arn
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "app_db" {
  count         = local.db_auth_iam ? 0 : 1
  secret_id     = aws_secretsmanager_secret.app_db[0].id
  secret_string = random_password.app_db[0].result
}
