# WAF no ALB: proteção de camada 7 de todo o tráfego da aplicação.
# Como as requisições chegam pelo API Gateway, o IP real do usuário vem no X-Forwarded-For.
resource "aws_wafv2_web_acl" "alb" {
  name  = "${local.nome}-aplicacao"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  # OWASP Top 10: XSS, path traversal, inclusão de arquivos etc.
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
        # A lista de quantidades da medição pode passar de 8 KB: essa regra só conta, não bloqueia
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            count {}
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesCommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  # Entradas maliciosas conhecidas, incluindo Log4Shell
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesKnownBadInputsRuleSet"
      sampled_requests_enabled   = true
    }
  }

  # SQL injection
  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 3
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesSQLiRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesSQLiRuleSet"
      sampled_requests_enabled   = true
    }
  }

  # Limite geral por IP (janela de 5 minutos)
  rule {
    name     = "limite-geral-por-ip"
    priority = 10
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "FORWARDED_IP"
        forwarded_ip_config {
          header_name       = "X-Forwarded-For"
          fallback_behavior = "MATCH"
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "limite-geral"
      sampled_requests_enabled   = true
    }
  }

  # Limite mais baixo para a API
  rule {
    name     = "limite-api-por-ip"
    priority = 11
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 600
        aggregate_key_type = "FORWARDED_IP"
        forwarded_ip_config {
          header_name       = "X-Forwarded-For"
          fallback_behavior = "MATCH"
        }
        scope_down_statement {
          byte_match_statement {
            search_string         = "/api/"
            positional_constraint = "STARTS_WITH"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "limite-api"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.nome}-aplicacao"
    sampled_requests_enabled   = true
  }
}

# WAF regional no Cognito: limite de tentativas de login (spec 001 RS05, ameaça T01)
resource "aws_wafv2_web_acl" "cognito" {
  name  = "${local.nome}-login"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesAmazonIpReputationList"
    priority = 0
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesAmazonIpReputationList"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "login-ip-reputacao"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "login-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "limite-login-por-ip"
    priority = 2
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 100
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "login-limite"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.nome}-login"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = aws_lb.principal.arn
  web_acl_arn  = aws_wafv2_web_acl.alb.arn
}

resource "aws_wafv2_web_acl_association" "cognito" {
  resource_arn = aws_cognito_user_pool.usuarios.arn
  web_acl_arn  = aws_wafv2_web_acl.cognito.arn
}

# Logs do WAF (o nome do grupo precisa começar com aws-waf-logs-)
resource "aws_cloudwatch_log_group" "waf" {
  for_each          = { aplicacao = aws_wafv2_web_acl.alb.arn, login = aws_wafv2_web_acl.cognito.arn }
  name              = "aws-waf-logs-${local.nome}-${each.key}"
  retention_in_days = 365
  kms_key_id        = aws_kms_key.principal.arn
}

resource "aws_cloudwatch_log_resource_policy" "waf" {
  policy_name = "${local.nome}-waf-logs"
  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "delivery.logs.amazonaws.com" }
      Action    = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource  = [for g in aws_cloudwatch_log_group.waf : "${g.arn}:*"]
      Condition = {
        StringEquals = { "aws:SourceAccount" = local.conta }
        ArnLike      = { "aws:SourceArn" = "arn:aws:logs:${local.regiao}:${local.conta}:*" }
      }
    }]
  })
}

resource "aws_wafv2_web_acl_logging_configuration" "waf" {
  for_each                = { aplicacao = aws_wafv2_web_acl.alb.arn, login = aws_wafv2_web_acl.cognito.arn }
  resource_arn            = each.value
  log_destination_configs = [aws_cloudwatch_log_group.waf[each.key].arn]
  depends_on              = [aws_cloudwatch_log_resource_policy.waf]
}
