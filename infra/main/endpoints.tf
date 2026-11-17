# VPC endpoints: a API e o worker falam com serviços AWS sem sair para a internet

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.principal.id
  service_name      = "com.amazonaws.${local.regiao}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.app.id]
  tags              = { Name = "${local.nome}-vpce-s3" }
}

locals {
  # ecr.api e ecr.dkr: baixar imagens | logs: CloudWatch | secretsmanager: senha do migrador | sqs: fila
  servicos_endpoint = ["ecr.api", "ecr.dkr", "logs", "secretsmanager", "sqs"]
  subnets_endpoint  = var.endpoints_multi_az ? aws_subnet.app[*].id : [aws_subnet.app[0].id]
}

resource "aws_vpc_endpoint" "interface" {
  for_each            = toset(local.servicos_endpoint)
  vpc_id              = aws_vpc.principal.id
  service_name        = "com.amazonaws.${local.regiao}.${each.key}"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = local.subnets_endpoint
  security_group_ids  = [aws_security_group.endpoints.id]
  tags                = { Name = "${local.nome}-vpce-${each.key}" }
}
