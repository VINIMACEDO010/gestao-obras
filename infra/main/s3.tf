# Dois buckets, ambos privados:
#   documentos -> fotos e PDFs (KMS, versionado, acesso por URL pré-assinada)
#   logs       -> ALB, VPC Flow Logs e CloudTrail

locals {
  bucket = { for k, nome in local.buckets : k => {
    id                          = nome
    bucket                      = nome
    arn                         = "arn:aws:s3:::${nome}"
    bucket_regional_domain_name = "${nome}.s3.${local.regiao}.amazonaws.com"
  } }
}

locals {
  buckets = {
    documentos = "${local.nome}-docs-${local.conta}"
    logs       = "${local.nome}-logs-${local.conta}"
  }
}

# No Learner Lab a política da AWS Academy bloqueia leituras que o recurso aws_s3_bucket
# faz (ex.: s3:GetBucketObjectLockConfiguration). Nesse caso os buckets são criados pelo
# script scripts/criar-buckets-learner-lab.ps1 e o Terraform gerencia só as configurações.
resource "aws_s3_bucket" "b" {
  #checkov:skip=CKV_AWS_144:Replicação entre regiões fora do escopo
  #checkov:skip=CKV2_AWS_62:Notificações de eventos não são usadas
  #checkov:skip=CKV_AWS_18:Acesso registrado pelo CloudTrail (data events) e pelo WAF
  #checkov:skip=CKV2_AWS_6:Bloqueio de acesso público criado para todos os buckets em aws_s3_bucket_public_access_block.b (for_each)
  #checkov:skip=CKV2_AWS_61:Ciclo de vida criado para todos em aws_s3_bucket_lifecycle_configuration.b (for_each)
  #checkov:skip=CKV_AWS_21:Versionamento criado para todos em aws_s3_bucket_versioning.b (for_each)
  #checkov:skip=CKV_AWS_145:Documentos usa KMS; logs exige SSE-S3 (requisito do ALB)
  for_each      = var.criar_buckets ? local.buckets : {}
  bucket        = each.value
  force_destroy = !var.protecao_exclusao
}

resource "aws_s3_bucket_public_access_block" "b" {
  for_each                = local.buckets
  bucket                  = each.value
  depends_on              = [aws_s3_bucket.b]
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "b" {
  for_each   = local.buckets
  bucket     = each.value
  depends_on = [aws_s3_bucket.b]
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "b" {
  for_each   = local.buckets
  bucket     = each.value
  depends_on = [aws_s3_bucket.b]
  versioning_configuration {
    status = "Enabled"
  }
}

# Documentos com a chave KMS do projeto. Logs com SSE-S3 (o ALB só grava logs em bucket SSE-S3).
resource "aws_s3_bucket_server_side_encryption_configuration" "b" {
  for_each   = local.buckets
  bucket     = each.value
  depends_on = [aws_s3_bucket.b]
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = each.key == "documentos" ? "aws:kms" : "AES256"
      kms_master_key_id = each.key == "documentos" ? aws_kms_key.principal.arn : null
    }
    bucket_key_enabled = each.key == "documentos"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "b" {
  for_each   = local.buckets
  bucket     = each.value
  depends_on = [aws_s3_bucket.b]
  rule {
    id     = "limpeza"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = each.key == "documentos" ? 90 : 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
    dynamic "expiration" {
      for_each = each.key == "logs" ? [1] : []
      content {
        days = 365
      }
    }
  }
}

# Upload direto do navegador para o bucket de documentos (spec 006)
resource "aws_s3_bucket_cors_configuration" "documentos" {
  bucket     = local.bucket["documentos"].id
  depends_on = [aws_s3_bucket.b, aws_s3_bucket_public_access_block.b]
  cors_rule {
    allowed_methods = ["POST", "GET"]
    allowed_origins = local.urls_site
    allowed_headers = ["*"]
    max_age_seconds = 3000
  }
}

data "aws_elb_service_account" "atual" {}

locals {
  negar_sem_tls = {
    for k, b in local.bucket : k => {
      Sid       = "SomenteHTTPS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [b.arn, "${b.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }
  }
}

resource "aws_s3_bucket_policy" "documentos" {
  bucket     = local.bucket["documentos"].id
  depends_on = [aws_s3_bucket.b, aws_s3_bucket_public_access_block.b]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      local.negar_sem_tls["documentos"],
      {
        Sid       = "SomenteKMS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${local.bucket["documentos"].arn}/*"
        Condition = { StringNotEquals = { "s3:x-amz-server-side-encryption" = "aws:kms" } }
      },
    ]
  })
}

resource "aws_s3_bucket_policy" "logs" {
  bucket     = local.bucket["logs"].id
  depends_on = [aws_s3_bucket.b, aws_s3_bucket_public_access_block.b]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      local.negar_sem_tls["logs"],
      {
        Sid       = "LogsDoALB"
        Effect    = "Allow"
        Principal = { AWS = data.aws_elb_service_account.atual.arn }
        Action    = "s3:PutObject"
        Resource  = "${local.bucket["logs"].arn}/alb/AWSLogs/${local.conta}/*"
      },
      {
        Sid       = "FlowLogsAcl"
        Effect    = "Allow"
        Principal = { Service = "delivery.logs.amazonaws.com" }
        Action    = ["s3:GetBucketAcl", "s3:ListBucket"]
        Resource  = local.bucket["logs"].arn
        Condition = { StringEquals = { "aws:SourceAccount" = local.conta } }
      },
      {
        Sid       = "FlowLogsGravacao"
        Effect    = "Allow"
        Principal = { Service = "delivery.logs.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${local.bucket["logs"].arn}/vpc-flow-logs/AWSLogs/${local.conta}/*"
        Condition = {
          StringEquals = { "s3:x-amz-acl" = "bucket-owner-full-control", "aws:SourceAccount" = local.conta }
        }
      },
      {
        Sid       = "CloudTrailAcl"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = local.bucket["logs"].arn
        Condition = { StringEquals = { "aws:SourceArn" = "arn:aws:cloudtrail:${local.regiao}:${local.conta}:trail/${local.nome}" } }
      },
      {
        Sid       = "CloudTrailGravacao"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${local.bucket["logs"].arn}/cloudtrail/AWSLogs/${local.conta}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"  = "bucket-owner-full-control"
            "aws:SourceArn" = "arn:aws:cloudtrail:${local.regiao}:${local.conta}:trail/${local.nome}"
          }
        }
      },
    ]
  })
}
