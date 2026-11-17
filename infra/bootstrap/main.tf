# Cria o bucket do estado remoto do Terraform. Rode UMA vez, com estado local:
#   cd infra/bootstrap && terraform init && terraform apply
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.80" }
  }
}

provider "aws" {
  region = var.regiao
}

variable "regiao" {
  type    = string
  default = "us-east-1"
}

variable "projeto" {
  type    = string
  default = "gestao-obras"
}

data "aws_caller_identity" "atual" {}

resource "aws_s3_bucket" "estado" {
  #checkov:skip=CKV_AWS_144:Replicação entre regiões fora do escopo acadêmico
  #checkov:skip=CKV_AWS_18:Log de acesso do bucket de estado não é necessário
  #checkov:skip=CKV2_AWS_62:Notificações de eventos não são necessárias
  #checkov:skip=CKV2_AWS_61:Versões antigas do estado devem ser mantidas
  bucket = "${var.projeto}-tfstate-${data.aws_caller_identity.atual.account_id}"
}

resource "aws_s3_bucket_versioning" "estado" {
  bucket = aws_s3_bucket.estado.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_kms_key" "estado" {
  description         = "Criptografia do estado do Terraform"
  enable_key_rotation = true
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "Administracao pela conta"
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.atual.account_id}:root" }
      Action    = "kms:*"
      Resource  = "*"
    }]
  })
}

resource "aws_s3_bucket_server_side_encryption_configuration" "estado" {
  bucket = aws_s3_bucket.estado.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.estado.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "estado" {
  bucket                  = aws_s3_bucket.estado.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "estado" {
  bucket = aws_s3_bucket.estado.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "SomenteHTTPS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.estado.arn, "${aws_s3_bucket.estado.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

output "bucket_estado" {
  value = aws_s3_bucket.estado.bucket
}

output "kms_estado" {
  value = aws_kms_key.estado.arn
}
