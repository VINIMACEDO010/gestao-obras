# VPC sem nenhuma subnet pública e sem Internet Gateway. Duas camadas em 2 AZs:
#   app   -> ALB interno, VPC Link do API Gateway e ECS (API e worker), sem rota para a internet
#   dados -> RDS, isolada (só tráfego vindo da camada app)
# A única entrada é o API Gateway (HTTPS), que alcança o ALB interno pelo VPC Link.

resource "aws_vpc" "principal" {
  cidr_block           = var.cidr_vpc
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${local.nome}-vpc" }
}

resource "aws_subnet" "app" {
  count             = 2
  vpc_id            = aws_vpc.principal.id
  cidr_block        = cidrsubnet(var.cidr_vpc, 8, 10 + count.index)
  availability_zone = local.azs[count.index]
  tags              = { Name = "${local.nome}-app-${count.index + 1}", Camada = "app" }
}

resource "aws_subnet" "dados" {
  count             = 2
  vpc_id            = aws_vpc.principal.id
  cidr_block        = cidrsubnet(var.cidr_vpc, 8, 20 + count.index)
  availability_zone = local.azs[count.index]
  tags              = { Name = "${local.nome}-dados-${count.index + 1}", Camada = "dados" }
}

# Sem NAT Gateway: a camada app só alcança a AWS pelos VPC endpoints
resource "aws_route_table" "app" {
  vpc_id = aws_vpc.principal.id
  tags   = { Name = "${local.nome}-rt-app" }
}

resource "aws_route_table_association" "app" {
  count          = 2
  subnet_id      = aws_subnet.app[count.index].id
  route_table_id = aws_route_table.app.id
}

resource "aws_route_table" "dados" {
  vpc_id = aws_vpc.principal.id
  tags   = { Name = "${local.nome}-rt-dados" }
}

resource "aws_route_table_association" "dados" {
  count          = 2
  subnet_id      = aws_subnet.dados[count.index].id
  route_table_id = aws_route_table.dados.id
}

# NACL da camada de dados: segunda barreira além do security group.
# Entra só PostgreSQL vindo da camada app; sai só resposta para a camada app.
resource "aws_network_acl" "dados" {
  vpc_id     = aws_vpc.principal.id
  subnet_ids = aws_subnet.dados[*].id
  tags       = { Name = "${local.nome}-nacl-dados" }
}

resource "aws_network_acl_rule" "dados_entrada_pg" {
  count          = 2
  network_acl_id = aws_network_acl.dados.id
  rule_number    = 100 + count.index
  egress         = false
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = aws_subnet.app[count.index].cidr_block
  from_port      = 5432
  to_port        = 5432
}

resource "aws_network_acl_rule" "dados_saida_retorno" {
  count          = 2
  network_acl_id = aws_network_acl.dados.id
  rule_number    = 100 + count.index
  egress         = true
  protocol       = "tcp"
  rule_action    = "allow"
  cidr_block     = aws_subnet.app[count.index].cidr_block
  from_port      = 1024
  to_port        = 65535
}

# O security group padrão da VPC fica sem nenhuma regra
resource "aws_default_security_group" "padrao" {
  vpc_id = aws_vpc.principal.id
}

# VPC Flow Logs para investigação de incidentes (gravados no bucket de logs, sem papel IAM)
resource "aws_flow_log" "vpc" {
  vpc_id               = aws_vpc.principal.id
  traffic_type         = "ALL"
  log_destination_type = "s3"
  log_destination      = "${local.bucket["logs"].arn}/vpc-flow-logs/"
  depends_on           = [aws_s3_bucket_policy.logs]
}

# Tráfego interno entre as subnets de dados (réplica Multi-AZ do RDS)
resource "aws_network_acl_rule" "dados_interno_entrada" {
  #checkov:skip=CKV_AWS_352:Tráfego apenas entre as próprias subnets de dados (réplica do RDS)
  count          = 2
  network_acl_id = aws_network_acl.dados.id
  rule_number    = 200 + count.index
  egress         = false
  protocol       = "-1"
  rule_action    = "allow"
  cidr_block     = aws_subnet.dados[count.index].cidr_block
}

resource "aws_network_acl_rule" "dados_interno_saida" {
  count          = 2
  network_acl_id = aws_network_acl.dados.id
  rule_number    = 200 + count.index
  egress         = true
  protocol       = "-1"
  rule_action    = "allow"
  cidr_block     = aws_subnet.dados[count.index].cidr_block
}
