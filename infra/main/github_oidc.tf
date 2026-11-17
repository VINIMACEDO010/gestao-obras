# GitHub Actions entra na AWS por OIDC: nenhuma chave de acesso fica guardada no GitHub

# No Learner Lab nada disto é criado: o pipeline usa as credenciais temporárias do laboratório.
locals {
  usar_oidc = !var.learner_lab
}

resource "aws_iam_openid_connect_provider" "github" {
  count           = local.usar_oidc && var.criar_oidc_github ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = local.usar_oidc && !var.criar_oidc_github ? 1 : 0
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  oidc_arn = !local.usar_oidc ? "" : (var.criar_oidc_github ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn)

  confianca_github = { for papel, subs in {
    # deploy: só jobs do ambiente "producao" (que exige aprovação manual no GitHub)
    deploy = ["repo:${var.github_repositorio}:environment:producao"]
    # plano: pull requests e a branch main, somente leitura
    plano = ["repo:${var.github_repositorio}:pull_request", "repo:${var.github_repositorio}:ref:refs/heads/main"]
    } : papel => jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect    = "Allow"
        Principal = { Federated = local.oidc_arn }
        Action    = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
          StringLike   = { "token.actions.githubusercontent.com:sub" = subs }
        }
      }]
  }) }
}

# Papel de deploy: aplica o Terraform e publica imagens e frontend.
# Usa AdministratorAccess porque o Terraform cria IAM, VPC, KMS etc.
# A proteção vem do ambiente "producao" com aprovação obrigatória e da branch main protegida.
resource "aws_iam_role" "github_deploy" {
  count                = local.usar_oidc ? 1 : 0
  name                 = "${local.nome}-github-deploy"
  assume_role_policy   = local.confianca_github["deploy"]
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "github_deploy" {
  #checkov:skip=CKV_AWS_274:Terraform precisa criar IAM e recursos de rede; acesso restrito ao ambiente com aprovação
  count      = local.usar_oidc ? 1 : 0
  role       = aws_iam_role.github_deploy[0].name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# Papel do terraform plan em pull requests: somente leitura + estado
resource "aws_iam_role" "github_plano" {
  count                = local.usar_oidc ? 1 : 0
  name                 = "${local.nome}-github-plano"
  assume_role_policy   = local.confianca_github["plano"]
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "github_plano" {
  count      = local.usar_oidc ? 1 : 0
  role       = aws_iam_role.github_plano[0].name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "github_plano_estado" {
  count = local.usar_oidc ? 1 : 0
  role  = aws_iam_role.github_plano[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Lock do estado (arquivo .tflock) durante o plan
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::${local.nome}-tfstate-${local.conta}/*.tflock"
      },
      {
        Effect    = "Allow"
        Action    = ["kms:Decrypt", "kms:GenerateDataKey"]
        Resource  = "*"
        Condition = { StringEquals = { "kms:ViaService" = "s3.${local.regiao}.amazonaws.com" } }
      },
    ]
  })
}
