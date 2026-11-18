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

variable "protecao_exclusao" {
  description = "Proteção contra exclusão do user pool. Ligada por padrão: esta camada não deve ser apagada."
  type        = bool
  default     = true
}
