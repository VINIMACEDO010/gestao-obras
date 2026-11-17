#!/usr/bin/env bash
# Cria um usuário no Cognito, vinculado a uma construtora e a um perfil.
# O Cognito envia por e-mail uma senha temporária; no primeiro login o usuário
# troca a senha e configura o MFA no aplicativo autenticador.
#
# Uso: ./scripts/criar-usuario.sh email@exemplo.com "Nome Completo" perfil EMPRESA_ID
#   perfil: admin | escritorio | canteiro | cliente
set -euo pipefail
EMAIL="${1:?Informe o e-mail}"
NOME="${2:?Informe o nome}"
PERFIL="${3:?Informe o perfil}"
EMPRESA="${4:?Informe o EMPRESA_ID (saída do criar-empresa.sh)}"

case "$PERFIL" in admin|escritorio|canteiro|cliente) ;; *) echo "Perfil inválido: $PERFIL"; exit 1 ;; esac
[[ "$EMPRESA" =~ ^[0-9a-f-]{36}$ ]] || { echo "EMPRESA_ID inválido"; exit 1; }

POOL=$(cd "$(dirname "$0")/../infra/main" && terraform output -raw cognito_user_pool_id)

aws cognito-idp admin-create-user --user-pool-id "$POOL" --username "$EMAIL" \
  --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
                    Name=name,Value="$NOME" Name=custom:empresa_id,Value="$EMPRESA" \
  --desired-delivery-mediums EMAIL >/dev/null

aws cognito-idp admin-add-user-to-group --user-pool-id "$POOL" --username "$EMAIL" --group-name "$PERFIL"
echo "Usuário $EMAIL criado com perfil $PERFIL. A senha temporária foi enviada por e-mail."
