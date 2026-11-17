#!/usr/bin/env bash
# Cadastra uma construtora no banco de produção e mostra o EMPRESA_ID.
# Uso: ./scripts/criar-empresa.sh "Construtora Exemplo" [CNPJ]
# Requer: AWS CLI logado na conta e terraform já aplicado.
set -euo pipefail
NOME="${1:?Informe o nome da construtora}"
CNPJ="${2:-}"
cd "$(dirname "$0")/../infra/main"
SUBNETS=$(terraform output -raw subnets_app)
SG=$(terraform output -raw sg_api)
CLUSTER=$(terraform output -raw cluster_ecs)

# Monta o JSON sem depender de python/jq (funciona no Git Bash do Windows)
esc() { local v="${1//\\/\\\\}"; printf '"%s"' "${v//\"/\\\"}"; }
ARGS="$(esc "$NOME")"
[ -n "$CNPJ" ] && ARGS="$ARGS,$(esc "$CNPJ")"
CMD="{\"containerOverrides\":[{\"name\":\"admin\",\"command\":[\"node\",\"dist/criar-empresa.js\",$ARGS]}]}"

TAREFA=$(aws ecs run-task --cluster "$CLUSTER" --task-definition gestao-obras-admin --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=DISABLED}" \
  --overrides "$CMD" --query 'tasks[0].taskArn' --output text)
echo "Tarefa iniciada: $TAREFA"
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TAREFA"

ID=${TAREFA##*/}
MSYS_NO_PATHCONV=1 aws logs get-log-events --log-group-name /ecs/gestao-obras/api --log-stream-name "admin/admin/$ID" \
  --query 'events[].message' --output text
