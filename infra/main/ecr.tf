resource "aws_ecr_repository" "img" {
  for_each             = toset(["api", "worker"])
  name                 = "${local.nome}/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = !var.protecao_exclusao

  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.principal.arn
  }
}

resource "aws_ecr_lifecycle_policy" "img" {
  for_each   = aws_ecr_repository.img
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Mantém as 15 imagens mais recentes"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 15 }
      action       = { type = "expire" }
    }]
  })
}
