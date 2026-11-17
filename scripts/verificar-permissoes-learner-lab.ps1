# Testa no Learner Lab as permissões de leitura de todos os serviços usados pelo projeto.
# Uso (PowerShell, na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File scripts\verificar-permissoes-learner-lab.ps1

$testes = @(
  "cloudfront list-distributions",
  "cloudfront list-functions",
  "cloudfront list-origin-access-controls",
  "cloudfront list-response-headers-policies",
  "wafv2 list-web-acls --scope CLOUDFRONT",
  "wafv2 list-web-acls --scope REGIONAL",
  "wafv2 list-logging-configurations --scope CLOUDFRONT",
  "cognito-idp list-user-pools --max-results 1",
  "ec2 describe-vpcs",
  "ec2 describe-vpc-endpoints",
  "ec2 describe-flow-logs",
  "ec2 describe-network-acls",
  "ec2 describe-managed-prefix-lists",
  "elbv2 describe-load-balancers",
  "elbv2 describe-target-groups",
  "ecs list-clusters",
  "ecs list-task-definitions",
  "ecr describe-repositories",
  "rds describe-db-instances",
  "rds describe-db-subnet-groups",
  "rds describe-db-parameter-groups",
  "secretsmanager list-secrets",
  "kms list-aliases",
  "sqs list-queues",
  "sns list-topics",
  "logs describe-log-groups --limit 1",
  "logs describe-resource-policies",
  "cloudwatch describe-alarms --max-records 1",
  "cloudtrail describe-trails",
  "application-autoscaling describe-scalable-targets --service-namespace ecs"
)

$bloqueados = @()
foreach ($t in $testes) {
  $args_ = $t.Split(" ")
  $saida = & aws @args_ 2>&1 | Out-String
  if ($saida -match "AccessDenied|not authorized|UnauthorizedOperation|explicit deny") {
    Write-Host ("  BLOQUEADO: " + $t) -ForegroundColor Red
    $bloqueados += $t
  } elseif ($LASTEXITCODE -ne 0) {
    Write-Host ("  ERRO:      " + $t + "  ->  " + ($saida.Trim() -split "`n")[0]) -ForegroundColor Yellow
  } else {
    Write-Host ("  ok:        " + $t)
  }
}

if ($bloqueados.Count -gt 0) {
  Write-Host ("`n" + $bloqueados.Count + " bloqueado(s). Mande esta saida para ajustar o projeto.") -ForegroundColor Yellow
} else {
  Write-Host "`nTudo liberado." -ForegroundColor Green
}
