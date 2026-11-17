variable "regiao" {
  type    = string
  default = "us-east-1"
}

variable "projeto" {
  type    = string
  default = "gestao-obras"
}

variable "ambiente" {
  type    = string
  default = "producao"
}

variable "cidr_vpc" {
  type    = string
  default = "10.20.0.0/16"
}

variable "imagem_tag" {
  description = "Tag das imagens da API e do worker no ECR (o pipeline passa o SHA do commit)"
  type        = string
  default     = "inicial"
}

variable "api_quantidade" {
  description = "Número de tarefas da API (2 = uma por AZ)"
  type        = number
  default     = 2
}

variable "rds_classe" {
  type    = string
  default = "db.t4g.micro"
}

variable "rds_multi_az" {
  description = "Liga o standby do RDS em outra AZ. Dobra o custo do banco."
  type        = bool
  default     = false
}

variable "endpoints_multi_az" {
  description = "Cria os VPC endpoints de interface nas duas AZs. Falso economiza metade do custo."
  type        = bool
  default     = false
}

variable "protecao_exclusao" {
  description = "Proteção contra exclusão no RDS e no Cognito. Deixe falso enquanto estiver testando."
  type        = bool
  default     = false
}

variable "email_alertas" {
  description = "E-mail que recebe alarmes e alertas de orçamento"
  type        = string
}

variable "limite_orcamento_usd" {
  type    = number
  default = 150
}

variable "habilitar_guardduty" {
  description = "Falso se a conta já tiver GuardDuty ligado"
  type        = bool
  default     = true
}

variable "github_repositorio" {
  description = "Repositório no formato dono/nome, usado na confiança OIDC"
  type        = string
}

variable "criar_oidc_github" {
  description = "Falso se a conta já tiver o provedor OIDC do GitHub"
  type        = bool
  default     = true
}

variable "urls_dev" {
  description = "URLs extras de callback do Cognito para testes locais (ex.: http://localhost:5173)"
  type        = list(string)
  default     = []
}

variable "learner_lab" {
  description = <<-EOT
    true para contas AWS Academy Learner Lab: usa o LabRole em vez de criar papéis IAM,
    troca a autenticação IAM do banco por senha no Secrets Manager e não cria OIDC do GitHub.
  EOT
  type        = bool
  default     = false
}

variable "habilitar_cloudtrail" {
  type    = bool
  default = true
}

variable "habilitar_orcamento" {
  description = "Cria o alerta do AWS Budgets (algumas contas de estudante não permitem)"
  type        = bool
  default     = true
}

variable "rds_tipo_disco" {
  description = "gp3 em conta normal; o Learner Lab só aceita gp2"
  type        = string
  default     = "gp3"
}

variable "criar_buckets" {
  description = "Falso no Learner Lab: os buckets são criados pelo AWS CLI (veja scripts/criar-buckets-learner-lab.ps1)"
  type        = bool
  default     = true
}
