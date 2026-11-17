terraform {
  # 1.10+ por causa do lock nativo do backend S3 (use_lockfile)
  required_version = ">= 1.10"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.80" }
    http   = { source = "hashicorp/http", version = "~> 3.4" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }

  # Valores em backend.hcl (veja backend.hcl.example)
  backend "s3" {}
}

provider "aws" {
  region = var.regiao
  default_tags {
    tags = {
      Projeto    = var.projeto
      Ambiente   = var.ambiente
      Gerenciado = "terraform"
    }
  }
}
