# Cria os buckets S3 para contas AWS Academy Learner Lab.
# A política do laboratório bloqueia leituras que o Terraform faz ao gerenciar buckets
# (ex.: s3:GetBucketObjectLockConfiguration). Por isso eles são criados aqui, e o
# Terraform cuida só das configurações (criptografia, versionamento, bloqueio público, políticas).
#
# Uso (PowerShell, na raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File scripts\criar-buckets-learner-lab.ps1

$regiao = "us-east-1"
$conta = aws sts get-caller-identity --query Account --output text
if ($LASTEXITCODE -ne 0) { Write-Host "Credenciais da AWS inválidas ou expiradas." -ForegroundColor Red; exit 1 }

$estado = "gestao-obras-tfstate-$conta"
$nomes = @($estado, "gestao-obras-docs-$conta", "gestao-obras-logs-$conta")

foreach ($b in $nomes) {
  aws s3api head-bucket --bucket $b 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Já existe: $b"
  } else {
    aws s3api create-bucket --bucket $b --region $regiao | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Host "Falha ao criar $b" -ForegroundColor Red; exit 1 }
    Write-Host "Criado:    $b" -ForegroundColor Green
  }
}

# O bucket do estado do Terraform é configurado aqui (o Terraform não gerencia ele)
$tmp = Join-Path $env:TEMP "cripto-estado.json"
'{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}' |
  Set-Content -Encoding ascii $tmp
aws s3api put-public-access-block --bucket $estado `
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
aws s3api put-bucket-versioning --bucket $estado --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket $estado --server-side-encryption-configuration "file://$tmp"
Write-Host "Bucket do estado protegido (privado, versionado e criptografado)." -ForegroundColor Green

# Confere se as leituras que o Terraform vai fazer estão liberadas pelo laboratório
Write-Host "`nVerificando permissões de leitura do S3..."
$testes = @(
  "get-bucket-versioning", "get-bucket-encryption", "get-public-access-block",
  "get-bucket-ownership-controls", "get-bucket-policy", "get-bucket-cors", "get-bucket-lifecycle-configuration"
)
$bloqueados = 0
foreach ($t in $testes) {
  $saida = aws s3api $t --bucket $estado 2>&1 | Out-String
  if ($saida -match "AccessDenied") {
    Write-Host "  BLOQUEADO: $t" -ForegroundColor Red
    $bloqueados++
  } else {
    Write-Host "  ok: $t"
  }
}
if ($bloqueados -gt 0) {
  Write-Host "`nAlgumas leituras estão bloqueadas. Mande esta saída para ajustar o projeto antes do apply." -ForegroundColor Yellow
} else {
  Write-Host "`nTudo liberado. Pode seguir para o terraform apply." -ForegroundColor Green
}
