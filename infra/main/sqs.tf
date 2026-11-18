# Fila de trabalhos do worker (validar foto, gerar PDF) e fila de erros (DLQ)
resource "aws_sqs_queue" "dlq" {
  name                              = "${local.nome}-jobs-dlq"
  message_retention_seconds         = 1209600
  kms_master_key_id                 = local.kms_arn
  kms_data_key_reuse_period_seconds = 3600
}

resource "aws_sqs_queue" "jobs" {
  name                              = "${local.nome}-jobs"
  visibility_timeout_seconds        = 180
  message_retention_seconds         = 345600
  receive_wait_time_seconds         = 20
  kms_master_key_id                 = local.kms_arn
  kms_data_key_reuse_period_seconds = 3600
  # Depois de 3 falhas a mensagem vai para a DLQ (spec 006 RS06)
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue_policy" "jobs" {
  for_each  = { jobs = aws_sqs_queue.jobs, dlq = aws_sqs_queue.dlq }
  queue_url = each.value.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "SomenteHTTPS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "sqs:*"
      Resource  = each.value.arn
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}
