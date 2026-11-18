terraform {
  required_version = ">= 1.10"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.80" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }

  # Mesmo bucket do infra/main, com outra chave:
  #   terraform init "-backend-config=../main/backend.hcl" "-backend-config=key=persistente/terraform.tfstate"
  backend "s3" {}
}

provider "aws" {
  region = var.regiao
  default_tags {
    tags = {
      Projeto    = var.projeto
      Ambiente   = var.ambiente
      Camada     = "persistente"
      Gerenciado = "terraform"
    }
  }
}
