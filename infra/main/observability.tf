# Trilha de auditoria da conta AWS (spec 009 RS03)
resource "aws_cloudtrail" "conta" {
  count = var.habilitar_cloudtrail ? 1 : 0
  #checkov:skip=CKV2_AWS_10:Logs ficam no S3; integração com CloudWatch Logs opcional
  #checkov:skip=CKV_AWS_252:Notificação SNS por arquivo de log não é necessária
  name                          = local.nome
  s3_bucket_name                = local.bucket["logs"].bucket
  s3_key_prefix                 = "cloudtrail"
  is_multi_region_trail         = true
  include_global_service_events = true
  enable_log_file_validation    = true
  kms_key_id                    = local.kms_arn
  depends_on                    = [aws_s3_bucket_policy.logs]
}

resource "aws_guardduty_detector" "conta" {
  #checkov:skip=CKV2_AWS_3:Conta única, sem AWS Organizations
  count  = var.habilitar_guardduty ? 1 : 0
  enable = true
}

resource "aws_sns_topic" "alertas" {
  name              = "${local.nome}-alertas"
  kms_master_key_id = local.kms_arn
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alertas.arn
  protocol  = "email"
  endpoint  = var.email_alertas
}

locals {
  alarmes = {
    api_erros_5xx = {
      descricao = "API respondendo com erro 5xx"
      namespace = "AWS/ApplicationELB"
      metrica   = "HTTPCode_Target_5XX_Count"
      estat     = "Sum"
      limite    = 10
      comparar  = "GreaterThanThreshold"
      dims      = { LoadBalancer = aws_lb.principal.arn_suffix }
    }
    alb_alvos_sem_saude = {
      descricao = "Tarefas da API fora do ar"
      namespace = "AWS/ApplicationELB"
      metrica   = "UnHealthyHostCount"
      estat     = "Maximum"
      limite    = 0
      comparar  = "GreaterThanThreshold"
      dims      = { LoadBalancer = aws_lb.principal.arn_suffix, TargetGroup = aws_lb_target_group.api.arn_suffix }
    }
    fila_erros = {
      descricao = "Mensagens na DLQ: jobs do worker falhando"
      namespace = "AWS/SQS"
      metrica   = "ApproximateNumberOfMessagesVisible"
      estat     = "Maximum"
      limite    = 0
      comparar  = "GreaterThanThreshold"
      dims      = { QueueName = aws_sqs_queue.dlq.name }
    }
    rds_cpu = {
      descricao = "CPU do banco acima de 80%"
      namespace = "AWS/RDS"
      metrica   = "CPUUtilization"
      estat     = "Average"
      limite    = 80
      comparar  = "GreaterThanThreshold"
      dims      = { DBInstanceIdentifier = aws_db_instance.principal.identifier }
    }
    rds_espaco = {
      descricao = "Menos de 2 GB livres no banco"
      namespace = "AWS/RDS"
      metrica   = "FreeStorageSpace"
      estat     = "Minimum"
      limite    = 2147483648
      comparar  = "LessThanThreshold"
      dims      = { DBInstanceIdentifier = aws_db_instance.principal.identifier }
    }
    waf_bloqueios = {
      descricao = "Pico de requisições bloqueadas pelo WAF (possível ataque)"
      namespace = "AWS/WAFV2"
      metrica   = "BlockedRequests"
      estat     = "Sum"
      limite    = 200
      comparar  = "GreaterThanThreshold"
      dims      = { WebACL = aws_wafv2_web_acl.alb.name, Rule = "ALL", Region = local.regiao }
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "a" {
  for_each            = local.alarmes
  alarm_name          = "${local.nome}-${each.key}"
  alarm_description   = each.value.descricao
  namespace           = each.value.namespace
  metric_name         = each.value.metrica
  statistic           = each.value.estat
  dimensions          = each.value.dims
  period              = 300
  evaluation_periods  = 1
  threshold           = each.value.limite
  comparison_operator = each.value.comparar
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertas.arn]
  ok_actions          = [aws_sns_topic.alertas.arn]
}

resource "aws_budgets_budget" "mensal" {
  count        = var.habilitar_orcamento ? 1 : 0
  name         = "${local.nome}-mensal"
  budget_type  = "COST"
  limit_amount = tostring(var.limite_orcamento_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.email_alertas]
  }
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.email_alertas]
  }
}
