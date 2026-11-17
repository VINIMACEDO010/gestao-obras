# Security groups encadeados: cada camada só aceita a camada anterior.
#   API Gateway (VPC Link) -> ALB interno -> API -> RDS
#                                            worker -> RDS

resource "aws_security_group" "vpc_link" {
  name        = "${local.nome}-vpc-link"
  description = "VPC Link do API Gateway: sai somente para o ALB"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_egress_rule" "vpc_link_alb" {
  security_group_id            = aws_security_group.vpc_link.id
  description                  = "Encaminha para o ALB interno"
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
}

resource "aws_security_group" "alb" {
  name        = "${local.nome}-alb"
  description = "ALB interno: aceita somente o VPC Link do API Gateway"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_ingress_rule" "alb_vpc_link" {
  #checkov:skip=CKV_AWS_260:A origem é o security group do VPC Link, não 0.0.0.0/0
  security_group_id            = aws_security_group.alb.id
  description                  = "Somente o VPC Link do API Gateway"
  referenced_security_group_id = aws_security_group.vpc_link.id
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
}

resource "aws_vpc_security_group_egress_rule" "alb_api" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Encaminha para a API"
  referenced_security_group_id = aws_security_group.api.id
  ip_protocol                  = "tcp"
  from_port                    = local.porta_api
  to_port                      = local.porta_api
}

resource "aws_security_group" "api" {
  name        = "${local.nome}-api"
  description = "API no ECS: aceita somente o ALB"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_ingress_rule" "api_alb" {
  security_group_id            = aws_security_group.api.id
  description                  = "Trafego do ALB"
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = local.porta_api
  to_port                      = local.porta_api
}

resource "aws_security_group" "worker" {
  name        = "${local.nome}-worker"
  description = "Worker no ECS: sem entrada"
  vpc_id      = aws_vpc.principal.id
}

# Saídas comuns de API e worker: banco, endpoints de interface e S3 (gateway)
locals {
  sg_app = { api = aws_security_group.api.id, worker = aws_security_group.worker.id }
}

resource "aws_vpc_security_group_egress_rule" "app_rds" {
  for_each                     = local.sg_app
  security_group_id            = each.value
  description                  = "PostgreSQL"
  referenced_security_group_id = aws_security_group.rds.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_vpc_security_group_egress_rule" "app_endpoints" {
  for_each                     = local.sg_app
  security_group_id            = each.value
  description                  = "VPC endpoints de interface"
  referenced_security_group_id = aws_security_group.endpoints.id
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
}

resource "aws_vpc_security_group_egress_rule" "app_s3" {
  for_each          = local.sg_app
  security_group_id = each.value
  description       = "S3 pelo endpoint gateway"
  prefix_list_id    = aws_vpc_endpoint.s3.prefix_list_id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_security_group" "rds" {
  name        = "${local.nome}-rds"
  description = "RDS: aceita somente API e worker na porta 5432"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_ingress_rule" "rds_app" {
  for_each                     = local.sg_app
  security_group_id            = aws_security_group.rds.id
  description                  = "PostgreSQL vindo de ${each.key}"
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_security_group" "endpoints" {
  name        = "${local.nome}-vpce"
  description = "VPC endpoints: HTTPS vindo de API e worker"
  vpc_id      = aws_vpc.principal.id
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_app" {
  for_each                     = local.sg_app
  security_group_id            = aws_security_group.endpoints.id
  description                  = "HTTPS vindo de ${each.key}"
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
}
