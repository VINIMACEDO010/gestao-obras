# Chave KMS do projeto (rotação anual automática). Usada em RDS, snapshots, S3 de documentos,
# SQS, ECR, CloudWatch Logs, CloudTrail, SNS e nos segredos.
# Fica na camada persistente: se fosse apagada junto com o ambiente, os snapshots do banco
# e as fotos já gravadas ficariam ilegíveis e a recuperação de desastre seria impossível.
resource "aws_kms_key" "principal" {
  description             = "Chave de dados do ${local.nome}"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "Administracao pela conta"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${local.conta}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "CloudWatch Logs"
        Effect    = "Allow"
        Principal = { Service = "logs.${local.regiao}.amazonaws.com" }
        Action    = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
        Resource  = "*"
        Condition = {
          ArnLike = { "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${local.regiao}:${local.conta}:*" }
        }
      },
      {
        Sid       = "CloudTrail"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = ["kms:GenerateDataKey*", "kms:DescribeKey"]
        Resource  = "*"
        Condition = {
          StringLike = { "kms:EncryptionContext:aws:cloudtrail:arn" = "arn:aws:cloudtrail:*:${local.conta}:trail/*" }
        }
      },
      {
        Sid       = "Alarmes publicando no SNS criptografado"
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = ["kms:Decrypt", "kms:GenerateDataKey*"]
        Resource  = "*"
      },
    ]
  })
}

resource "aws_kms_alias" "principal" {
  name          = "alias/${local.nome}"
  target_key_id = aws_kms_key.principal.key_id
}
