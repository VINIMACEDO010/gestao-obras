# Plano de Recuperação de Desastres (DR)

Sistema de Gestão de Obras, ambiente de produção na AWS (us-east-1).

## 1. Objetivo

Garantir que o sistema volte a funcionar, com os dados preservados, depois de qualquer evento que derrube ou corrompa o ambiente: exclusão acidental, falha de infraestrutura, erro humano no banco, perda de uma zona de disponibilidade ou da região inteira.

A base do plano é a **infraestrutura como código**. Todo o ambiente é descrito em Terraform e pode ser recriado do zero com dois comandos. O que não pode ser recriado (dados, chave de criptografia e identidade dos usuários) fica separado numa camada persistente e com backup.

## 2. Metas

| Indicador | Meta | Como é atingido |
|---|---|---|
| **RTO** (tempo para voltar ao ar) | 1 hora | Terraform recria rede, banco, ECS, WAF e API Gateway em cerca de 25 min; o pipeline publica a aplicação em cerca de 15 min |
| **RPO** em destruição controlada | Zero | Snapshot final automático no `terraform destroy` |
| **RPO** em falha inesperada do banco | Até 5 minutos | Backups automáticos do RDS com restauração para um ponto no tempo (PITR), retidos por 7 dias |
| **RPO** dos documentos e fotos | Zero | Bucket S3 versionado, fora do ciclo de vida do ambiente |

## 3. Arquitetura em camadas para DR

| Camada | O que contém | Ciclo de vida | Onde |
|---|---|---|---|
| **Estado** | Estado do Terraform | Permanente, versionado e criptografado | Bucket `gestao-obras-tfstate-<conta>` |
| **Persistente** | Chave KMS e Cognito (usuários, senhas, MFA, grupos) | Criada uma vez, com proteção contra exclusão | `infra/persistente` |
| **Dados** | Snapshots e backups do RDS; buckets de documentos e de logs | Sobrevivem ao destroy do ambiente | RDS e S3 |
| **Recriável** | VPC, subnets, endpoints, ALB, WAF, API Gateway, ECS, RDS, SQS, ECR, alarmes | Destruída e recriada a qualquer momento | `infra/main` |
| **Código** | Aplicação, specs, Terraform e pipelines | Permanente | GitHub |

Por que a chave KMS é persistente: o banco, os snapshots e as fotos são criptografados com ela. Se ela fosse apagada junto com o ambiente, os backups existiriam mas ficariam ilegíveis, e a recuperação seria impossível.

## 4. O que é protegido e como

| Ativo | Proteção | Retenção |
|---|---|---|
| Banco PostgreSQL | Backups automáticos diários com logs de transação (PITR) | 7 dias, mantidos mesmo após o destroy (`delete_automated_backups = false`) |
| Banco PostgreSQL | Snapshot final em todo destroy (`gestao-obras-final-AAAAMMDD-hhmm`) | Até ser apagado manualmente |
| Fotos e PDFs | S3 versionado e criptografado (KMS) | Versões antigas por 90 dias |
| Usuários | Cognito na camada persistente | Permanente |
| Chave de criptografia | KMS com rotação anual; janela de 30 dias para cancelar uma exclusão | Permanente |
| Estado do Terraform | S3 versionado e criptografado | Permanente |
| Imagens dos contêineres | Reconstruídas pelo pipeline a partir do código | Não precisam de backup |
| Senhas do banco | Geradas de novo na recriação (Secrets Manager); a migração reaplica a senha do `app_user` | Não precisam de backup |

## 5. Cenários e procedimentos

Os comandos abaixo são para PowerShell, na pasta do projeto, com as credenciais da AWS configuradas. Na conta de laboratório (AWS Academy), use `-var-file=learner-lab.tfvars` em todos os comandos do Terraform.

### Cenário 1: ambiente apagado ou corrompido

Exemplos: alguém rodou `terraform destroy`, a conta de laboratório foi reiniciada, uma alteração manual quebrou a rede.

1. Localize o snapshot mais recente:

   ```powershell
   aws rds describe-db-snapshots --query "reverse(sort_by(DBSnapshots,&SnapshotCreateTime))[].[DBSnapshotIdentifier,SnapshotCreateTime,Status]" --output table
   ```

2. Se o ambiente ainda existir corrompido, destrua o que sobrou. O destroy gera mais um snapshot.

   ```powershell
   cd infra\main
   terraform destroy "-var-file=learner-lab.tfvars"
   ```

3. Recrie o ambiente a partir do snapshot:

   ```powershell
   terraform apply "-var-file=learner-lab.tfvars" "-var=restaurar_snapshot=gestao-obras-final-AAAAMMDD-hhmm"
   ```

4. Publique a aplicação: GitHub, **Actions > Deploy > Run workflow**, depois aprovar.
5. Valide conforme a seção 6.

Os usuários continuam com a mesma senha e o mesmo MFA, porque o Cognito está na camada persistente. A URL do sistema muda, porque o API Gateway é recriado; ela aparece em `terraform output -raw url_site`.

### Cenário 2: erro humano ou corrupção de dados

Exemplos: uma medição foi apagada por engano, um script alterou dados errados.

1. Antes de agir, consulte a **auditoria** do sistema: ela mostra o valor antigo e o novo de toda alteração. Correções pontuais podem ser feitas pela própria aplicação, sem restaurar nada.
2. Se for preciso voltar o banco inteiro, restaure para um momento anterior ao problema numa instância temporária e gere um snapshot dela:

   ```powershell
   aws rds restore-db-instance-to-point-in-time --source-db-instance-identifier gestao-obras-db --target-db-instance-identifier gestao-obras-pitr --restore-time 2026-11-18T13:00:00Z --db-subnet-group-name gestao-obras-dados --no-publicly-accessible
   aws rds wait db-instance-available --db-instance-identifier gestao-obras-pitr
   aws rds create-db-snapshot --db-instance-identifier gestao-obras-pitr --db-snapshot-identifier gestao-obras-pitr-AAAAMMDD
   aws rds wait db-snapshot-available --db-snapshot-identifier gestao-obras-pitr-AAAAMMDD
   aws rds delete-db-instance --db-instance-identifier gestao-obras-pitr --skip-final-snapshot
   ```

3. Siga o Cenário 1 a partir do passo 2, usando `restaurar_snapshot=gestao-obras-pitr-AAAAMMDD`.

O horário do `--restore-time` é em UTC (horário de Brasília + 3 horas).

### Cenário 3: falha de uma zona de disponibilidade

- **API e worker**: o ECS distribui as tarefas entre duas AZs e o ALB deixa de enviar tráfego para a AZ com problema. Nenhuma ação manual.
- **Banco**: com `rds_multi_az = true`, o RDS troca para a réplica da outra AZ em 1 a 2 minutos, sem ação manual. Na conta de laboratório o Multi-AZ não é permitido; nesse caso, aplique o Cenário 1 (o RDS é criado numa AZ disponível).

### Cenário 4: perda da região us-east-1

Procedimento documentado, não automatizado.

1. Copie o snapshot mais recente para a região de contingência (us-west-2), recriptografando com uma chave KMS de lá:

   ```powershell
   aws rds copy-db-snapshot --source-region us-east-1 --region us-west-2 --source-db-snapshot-identifier arn:aws:rds:us-east-1:<conta>:snapshot:<snapshot> --target-db-snapshot-identifier <snapshot> --kms-key-id <chave-kms-us-west-2>
   ```

2. Aplique `infra/persistente` e `infra/main` com `regiao = "us-west-2"` e uma chave de estado própria (por exemplo `contingencia/terraform.tfstate`), usando `restaurar_snapshot`.
3. Recrie os usuários no novo Cognito (`scripts/criar-usuario.sh`). O Cognito não replica entre regiões.

Para reduzir o RPO nesse cenário, a evolução recomendada é a cópia automática de backups entre regiões do RDS (*cross-region automated backups*) e a replicação do bucket de documentos.

### Cenário 5: credenciais comprometidas

1. Encerre as sessões do usuário afetado: `aws cognito-idp admin-user-global-sign-out --user-pool-id <pool> --username <email>`.
2. Desative o usuário, se necessário: `aws cognito-idp admin-disable-user ...`.
3. Credenciais da AWS no GitHub: na conta de laboratório, encerre a sessão (End Lab) para invalidar as chaves temporárias; em conta normal, o pipeline usa OIDC e não há chave fixa para revogar.
4. Investigue com o CloudTrail (ações na conta), os logs do WAF e do API Gateway (requisições) e a auditoria do sistema (alterações nos dados).

## 6. Validação depois da recuperação

- [ ] `curl.exe https://<url>/api/health` responde `{"status":"ok"}`
- [ ] Login com um usuário existente, incluindo o MFA
- [ ] As obras e medições anteriores ao incidente aparecem
- [ ] Uma foto antiga abre (prova que a chave KMS foi preservada)
- [ ] O teste de fumaça do pipeline ficou verde
- [ ] O CI na branch main está verde

## 7. Testes do plano

O plano deve ser ensaiado antes de cada apresentação ou entrega e depois de mudanças grandes na infraestrutura. Em cada ensaio: subir o ambiente, cadastrar dados de teste, rodar `terraform destroy`, recriar com `restaurar_snapshot` e preencher a tabela.

| Data | Cenário | Tempo de recuperação medido | Dados preservados? | Observações |
|---|---|---|---|---|
| 17/11/2026 | Criação do ambiente do zero | ~25 min (Terraform) + ~15 min (deploy) | Não se aplica | RDS levou 10m42s para ser criado |
| | Cenário 1 (destroy e restauração) | | | |

## 8. Limitações conhecidas

- Na conta AWS Academy não há Multi-AZ no RDS, nem CloudFront, nem criação de papéis IAM próprios; o plano usa as alternativas descritas no README.
- O Cenário 4 depende de passos manuais e de uma chave KMS na região de contingência.
- As credenciais da conta de laboratório expiram a cada sessão (cerca de 4 horas) e precisam ser atualizadas no PowerShell e nos secrets do GitHub antes de qualquer recuperação.
