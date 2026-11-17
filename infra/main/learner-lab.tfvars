# Ajustes para contas AWS Academy Learner Lab.
# Uso: terraform apply -var-file=learner-lab.tfvars
# (o terraform.tfvars com e-mail e repositório continua sendo lido automaticamente)
learner_lab         = true
rds_tipo_disco      = "gp2"
rds_classe          = "db.t3.micro"
habilitar_guardduty = false
habilitar_orcamento = false

# Buckets criados pelo AWS CLI (a política do laboratório bloqueia leituras do Terraform)
criar_buckets = false

# Economiza o crédito do laboratório (1 tarefa da API em vez de 2)
api_quantidade = 1
