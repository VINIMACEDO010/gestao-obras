# Gestão de Obras

SaaS para construtoras controlarem orçamento, cronograma, compras, diário de obra com fotos e medições, com acompanhamento pelo cliente da obra. Roda na AWS com foco em desenvolvimento seguro.

> **Entrega do trabalho:** o mapa completo de requisitos, o diagrama de arquitetura e as evidências estão em [`docs/ENTREGA.md`](docs/ENTREGA.md).

## Onde cada requisito do trabalho está

| Requisito | Onde |
|---|---|
| Código no GitHub com SAST (SonarQube) | `.github/workflows/ci.yml` (job `sast`), `sonar-project.properties` |
| Desenvolvimento seguro com SDD | `specs/` (uma spec por funcionalidade, com requisitos de segurança ASVS e modelo STRIDE) |
| Infraestrutura com Terraform (plano de DR) | `infra/persistente` e `infra/main`; plano em [`docs/plano-de-recuperacao-de-desastres.md`](docs/plano-de-recuperacao-de-desastres.md) |
| WAF camada 7 | `infra/main/waf.tf` (WAF no ALB, que recebe todo o tráfego da aplicação, e WAF no login do Cognito) |
| Isolamento de rede | `infra/main/network.tf`, `security_groups.tf`, `endpoints.tf` |
| Aplicação funcional | `api/`, `worker/`, `web/` |

Além do SonarQube, o pipeline roda Gitleaks (segredos), Trivy (dependências e imagens), Checkov (Terraform e Dockerfiles) e os testes automatizados, incluindo testes de integração que provam o isolamento entre empresas no banco.

## Arquitetura

```
Usuário ──HTTPS──► API Gateway (HTTP API, certificado da AWS, limite de requisições)
                        │ VPC Link (rede privada)
                        ▼
              ALB interno + WAF (OWASP, SQL injection, limite por IP)
                        ▼
        ECS Fargate: API + frontend React/PWA (subnet privada, sem rota para a internet)
               │                     │
               ▼                     ▼
        RDS PostgreSQL          SQS ──► ECS Fargate: worker (valida fotos, gera PDFs)
        (subnet isolada,                     │
         RLS, auditoria)                     ▼
                                     S3 documentos (KMS)
Login: Cognito (MFA obrigatório) + WAF regional
Serviços AWS acessados por VPC endpoints (sem NAT Gateway e sem Internet Gateway)
```

Nenhum recurso dentro da VPC tem endereço público. A única porta de entrada é o API Gateway, que fala com o ALB interno por um VPC Link.

**Por que API Gateway e não CloudFront:** o AWS Academy Learner Lab bloqueia totalmente o CloudFront. O API Gateway cumpre o mesmo papel de borda (HTTPS com certificado válido e controle de taxa), e o WAF foi para o ALB, por onde passa todo o tráfego da aplicação.

Camadas de defesa contra vazamento entre construtoras:

1. **RBAC na API** (`api/src/rbac.ts`): cada rota declara os perfis permitidos.
2. **Row Level Security no PostgreSQL** (`api/migrations/001_schema.sql`): mesmo que a API tenha um bug de filtro, o banco só devolve dados da empresa do usuário. O cliente da obra só enxerga as obras dele, não vê compras e não grava nada.
3. **Auditoria por trigger**: toda alteração fica registrada, e o usuário da aplicação não consegue apagar nem alterar esse registro.

## Estrutura

```
specs/          Especificações (SDD), modelo de ameaças e matriz de permissões
api/            API Node.js + TypeScript (Fastify), migrações SQL e testes
worker/         Consumidor da fila: valida fotos (magic bytes) e gera PDFs
web/            Frontend React + Vite (PWA para uso no canteiro)
infra/          Terraform: bootstrap do estado, camada persistente (KMS e Cognito) e ambiente recriável
docs/           Plano de recuperação de desastres
scripts/        Cadastro de construtora e de usuários em produção
.github/        Pipelines de CI, plano do Terraform e deploy
```

## Rodar localmente

Pré-requisitos: Node.js 22 e Docker.

```bash
npm install
docker compose up -d                  # PostgreSQL + LocalStack (S3 e SQS)

cp api/.env.example api/.env
cp worker/.env.example worker/.env
cp web/.env.example web/.env.local

npm run migrate:dev --workspace api   # cria as tabelas e o usuário app_user
npm run seed:dev --workspace api      # duas construtoras de exemplo e 5 usuários

# em três terminais
npm run dev --workspace api           # http://localhost:3000
npm run dev --workspace worker
npm run dev --workspace web           # http://localhost:5173
```

No modo local, o login é simulado (tela com os usuários do seed). Em produção esse modo é bloqueado na inicialização da API.

Testes:

```bash
npm test          # usa o PostgreSQL do docker compose para os testes de integração
```

## Subir na AWS

### 1. Estado remoto do Terraform (uma vez)

```bash
cd infra/bootstrap
terraform init && terraform apply
```

Anote a saída `bucket_estado`.

### 2. Camada persistente (uma vez)

Chave KMS e Cognito ficam separados do resto, para sobreviverem a um `terraform destroy` do ambiente e permitirem a recuperação de desastres.

```bash
cd infra/main
cp backend.hcl.example backend.hcl            # coloque o bucket do passo 1
cd ../persistente
terraform init -backend-config=../main/backend.hcl -backend-config=key=persistente/terraform.tfstate
terraform apply
```

### 2.1 Ambiente (na sua máquina, com usuário administrador)

```bash
cd infra/main
cp terraform.tfvars.example terraform.tfvars  # seu e-mail e o repositório GitHub
terraform init -backend-config=backend.hcl
terraform apply
```

Esse primeiro apply cria tudo, inclusive os papéis que o GitHub Actions vai usar. As tarefas do ECS ainda vão falhar, porque as imagens não existem: isso se resolve no primeiro deploy pelo pipeline. Confirme a inscrição no e-mail de alertas que a AWS envia.

### 3. Configurar o GitHub

Em **Settings > Secrets and variables > Actions**:

| Tipo | Nome | Valor |
|---|---|---|
| Variable | `AWS_DEPLOY_ROLE_ARN` | saída `papel_github_deploy` |
| Variable | `AWS_PLAN_ROLE_ARN` | saída `papel_github_plano` |
| Variable | `TF_STATE_BUCKET` | bucket do passo 1 |
| Variable | `EMAIL_ALERTAS` | seu e-mail |
| Secret | `SONAR_TOKEN` | token do SonarQube Cloud |

Também configure:

- **Settings > Environments**: crie o ambiente `producao` com *Required reviewers* (você mesmo). Todo deploy vai esperar sua aprovação.
- **Settings > Branches**: proteja a `main` exigindo pull request e os checks do CI.
- **Settings > Code security**: ligue *Secret scanning* e *Dependabot alerts*.
- **SonarQube Cloud** (sonarcloud.io): importe o repositório, desligue a *Automatic Analysis* (a análise vem do pipeline) e ajuste `sonar.organization` e `sonar.projectKey` em `sonar-project.properties`.

### 4. Deploy

Faça push na `main`. O CI roda, e o workflow **Deploy** monta e verifica as imagens (a da API já leva o frontend), aplica o Terraform com a nova versão e faz um teste de fumaça. A URL do sistema é a saída `url_site`.

### 5. Primeira construtora e usuários

```bash
./scripts/criar-empresa.sh "Construtora Exemplo" 12.345.678/0001-90
# mostra EMPRESA_ID=...

./scripts/criar-usuario.sh voce@exemplo.com "Seu Nome" admin <EMPRESA_ID>
```

O usuário recebe a senha temporária por e-mail. No primeiro acesso ele troca a senha e cadastra o MFA num aplicativo autenticador.

## Conta de estudante (AWS Academy Learner Lab)

O Learner Lab não deixa criar papéis IAM e não tem OIDC para o GitHub. O projeto tem um modo próprio para isso, ligado pelo arquivo `infra/main/learner-lab.tfvars`. Nesse modo:

| Conta normal | Learner Lab |
|---|---|
| Papéis IAM próprios por tarefa (mínimo privilégio) | `LabRole` pré-criado pela AWS Academy |
| API e worker entram no banco por token IAM, sem senha | Senha do `app_user` gerada pelo Terraform e guardada no Secrets Manager (KMS) |
| GitHub Actions entra na AWS por OIDC | Credenciais temporárias da sessão do laboratório, em secrets do GitHub |
| RDS gp3, Multi-AZ opcional | RDS gp2, sem Multi-AZ (limite do laboratório) |
| Budgets e GuardDuty | Desligados (não disponíveis em todos os laboratórios) |

O que não muda: VPC isolada, API Gateway, WAF, Cognito com MFA, KMS, RLS no banco, auditoria e todo o pipeline de SAST.

Diferenças na operação:

- Aplique a camada persistente (`infra/persistente`) antes do ambiente, com os mesmos comandos do passo 2. Ela não usa o `learner-lab.tfvars`.
- Não use o `infra/bootstrap`. A política do laboratório bloqueia leituras que o Terraform faz em buckets S3, então os quatro buckets (estado, site, documentos e logs) são criados pelo script `scripts/criar-buckets-learner-lab.ps1`, e o Terraform gerencia só as configurações deles.
- Use sempre `-var-file=learner-lab.tfvars` no `terraform plan/apply/destroy`.
- As credenciais vêm de **AWS Details > AWS CLI: Show** no laboratório e valem só durante a sessão (cerca de 4 horas). Cole em `~/.aws/credentials` antes de usar o Terraform.
- No GitHub, em vez de `AWS_DEPLOY_ROLE_ARN` e `AWS_PLAN_ROLE_ARN`, crie a variável `LEARNER_LAB = true` e os secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` e `AWS_SESSION_TOKEN`. Atualize os três a cada nova sessão do laboratório, antes de rodar o deploy.
- O crédito do laboratório é fixo. Rode `terraform destroy -var-file=learner-lab.tfvars` sempre que não estiver usando.

## Recuperação de desastres

Resumo do [plano completo](docs/plano-de-recuperacao-de-desastres.md):

- **RTO de 1 hora**: o Terraform recria o ambiente inteiro e o pipeline publica a aplicação.
- **RPO zero** num destroy controlado (snapshot final automático) e de até 5 minutos numa falha do banco (backups com restauração para um ponto no tempo, mantidos por 7 dias).
- Chave KMS e Cognito ficam na camada persistente: depois da recuperação os usuários entram com a mesma senha e MFA, e as fotos antigas continuam legíveis.

Recuperar o ambiente com os dados:

```bash
aws rds describe-db-snapshots --query "reverse(sort_by(DBSnapshots,&SnapshotCreateTime))[].DBSnapshotIdentifier"
cd infra/main
terraform apply -var-file=learner-lab.tfvars -var=restaurar_snapshot=gestao-obras-final-AAAAMMDD-hhmm
```

## Demonstrações de segurança para a apresentação

```bash
URL=$(cd infra/main && terraform output -raw url_site)

# WAF bloqueia SQL injection (403)
curl -s -o /dev/null -w "%{http_code}\n" "$URL/api/obras?id=1'%20OR%20'1'='1"

# O ALB não tem endereço público: o nome dele nem resolve para um IP da internet
aws elbv2 describe-load-balancers --names gestao-obras-alb --query "LoadBalancers[0].Scheme"

# API sem token: 401
curl -s -o /dev/null -w "%{http_code}\n" "$URL/api/obras"
```

No sistema: entre com usuários de duas construtoras diferentes e mostre que uma não vê as obras da outra. Entre como cliente e mostre que só aparece a obra dele, sem a aba de compras. Envie um arquivo que não é imagem renomeado para `.jpg` e mostre a foto rejeitada. Na tela de auditoria, mostre o antes e depois de uma alteração de orçamento.

Os testes que comprovam essas regras estão em `api/test/integracao.test.ts`.

## Custos

Estimativa com os valores padrão, ligado 24 horas (us-east-1):

| Item | US$/mês (aprox.) |
|---|---|
| 5 VPC endpoints de interface (1 AZ) | 37 |
| 3 tarefas Fargate (0,25 vCPU, 512 MB) | 27 |
| WAF (2 web ACLs e regras) | 19 |
| ALB interno + API Gateway | 18 |
| RDS `db.t4g.micro` + 20 GB | 15 |
| KMS, logs, Secrets Manager, Container Insights | 5 a 10 |
| **Total** | **cerca de 110 (uns 3,50 por dia)** |

Na prática, como o projeto só precisa ficar ligado durante o desenvolvimento e a apresentação, o gasto real costuma ser bem menor. Para economizar no dia a dia, use `api_quantidade = 1`. O AWS Budgets avisa por e-mail ao atingir 80% do limite definido em `limite_orcamento_usd` (padrão US$ 150).

Para a apresentação, ligue alta disponibilidade completa (`rds_multi_az = true` e `endpoints_multi_az = true`). Quando não estiver usando:

```bash
cd infra/main && terraform destroy
```

## Limitações conhecidas

- O HTTPS termina no API Gateway. Do VPC Link até o ALB interno o tráfego é HTTP, mas fica dentro da VPC, em subnets privadas e restrito por security group.
- No Learner Lab, todas as tarefas usam o mesmo `LabRole`, que tem mais permissões do que o necessário. Em conta normal cada tarefa tem o seu papel com o mínimo.
- O papel de deploy do GitHub tem `AdministratorAccess`, porque o Terraform cria IAM e rede. Ele só pode ser assumido por jobs do ambiente `producao`, que exige aprovação manual.
- O cadastro de construtoras e usuários é feito por scripts, sem tela de administração.
