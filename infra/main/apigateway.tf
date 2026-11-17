# Borda pública: API Gateway HTTP API com HTTPS (certificado da própria AWS).
# Substitui o CloudFront, que é bloqueado no AWS Academy Learner Lab.
resource "aws_apigatewayv2_api" "borda" {
  name          = "${local.nome}-borda"
  protocol_type = "HTTP"
  description   = "Entrada HTTPS do Gestão de Obras"
}

# VPC Link: ponte privada do API Gateway até o ALB interno
resource "aws_apigatewayv2_vpc_link" "alb" {
  name               = "${local.nome}-vpc-link"
  subnet_ids         = aws_subnet.app[*].id
  security_group_ids = [aws_security_group.vpc_link.id]
}

resource "aws_apigatewayv2_integration" "alb" {
  api_id                 = aws_apigatewayv2_api.borda.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  integration_uri        = aws_lb_listener.principal.arn
  connection_type        = "VPC_LINK"
  connection_id          = aws_apigatewayv2_vpc_link.alb.id
  payload_format_version = "1.0"
  timeout_milliseconds   = 29000
}

resource "aws_apigatewayv2_route" "tudo" {
  #checkov:skip=CKV_AWS_309:A autenticação (Cognito + MFA) é validada na API; o frontend e o health check são públicos
  api_id    = aws_apigatewayv2_api.borda.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.alb.id}"
}

resource "aws_cloudwatch_log_group" "apigateway" {
  name              = "/apigateway/${local.nome}"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.principal.arn
}

resource "aws_apigatewayv2_stage" "padrao" {
  api_id      = aws_apigatewayv2_api.borda.id
  name        = "$default"
  auto_deploy = true

  # Limite de requisições na borda (além do WAF)
  default_route_settings {
    throttling_burst_limit = 200
    throttling_rate_limit  = 100
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigateway.arn
    format = jsonencode({
      requestId = "$context.requestId"
      ip        = "$context.identity.sourceIp"
      metodo    = "$context.httpMethod"
      rota      = "$context.path"
      status    = "$context.status"
      latencia  = "$context.responseLatency"
      erro      = "$context.integrationErrorMessage"
    })
  }
}
