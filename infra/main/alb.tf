# ALB interno: não tem endereço público. Só recebe tráfego do VPC Link do API Gateway.
resource "aws_lb" "principal" {
  #checkov:skip=CKV_AWS_150:Proteção contra exclusão controlada por variável
  #checkov:skip=CKV2_AWS_20:ALB interno; o redirecionamento e o HTTPS ficam no API Gateway
  name                       = "${local.nome}-alb"
  load_balancer_type         = "application"
  internal                   = true
  subnets                    = aws_subnet.app[*].id
  security_groups            = [aws_security_group.alb.id]
  drop_invalid_header_fields = true
  enable_deletion_protection = var.protecao_exclusao
  desync_mitigation_mode     = "strictest"

  access_logs {
    bucket  = local.bucket["logs"].bucket
    prefix  = "alb"
    enabled = true
  }

  depends_on = [aws_s3_bucket_policy.logs]
}

resource "aws_lb_target_group" "api" {
  #checkov:skip=CKV_AWS_378:Tráfego ALB -> API dentro da VPC, em subnet privada e restrito por security group
  name                 = "${local.nome}-api"
  port                 = local.porta_api
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.principal.id
  deregistration_delay = 30
  health_check {
    path                = "/api/health"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

# O TLS termina no API Gateway; do VPC Link até o ALB o tráfego fica dentro da VPC.
resource "aws_lb_listener" "principal" {
  #checkov:skip=CKV_AWS_2:ALB interno; o HTTPS público termina no API Gateway
  #checkov:skip=CKV_AWS_103:ALB interno; o HTTPS público termina no API Gateway
  #checkov:skip=CKV2_AWS_74:ALB interno; o HTTPS público termina no API Gateway
  load_balancer_arn = aws_lb.principal.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}
