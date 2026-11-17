# 001 - Autenticação e perfis

- **Status:** aprovada

## Contexto

Os usuários são da construtora (escritório e canteiro) e clientes da obra. O cadastro é feito só pelo administrador, não existe auto cadastro.

## Requisitos funcionais

- RF01 - Login pelo Cognito (tela gerenciada) com fluxo Authorization Code + PKCE.
- RF02 - MFA por aplicativo autenticador (TOTP) obrigatório para todos.
- RF03 - Perfis: `admin`, `escritorio`, `canteiro`, `cliente`, representados por grupos do Cognito.
- RF04 - Cada usuário pertence a uma empresa, gravada no atributo `custom:empresa_id`.
- RF05 - Endpoint `GET /api/me` devolve nome, e-mail, perfil e empresa do usuário logado.
- RF06 - Logout encerra a sessão no Cognito e no navegador.

## Regras de negócio

- RN01 - Usuário sem grupo ou sem empresa não acessa nada (403).
- RN02 - Se o usuário estiver em mais de um grupo, vale o de maior privilégio na ordem admin > escritorio > canteiro > cliente.
- RN03 - Usuários são criados pelo script `scripts/criar-usuario.sh`.

## Requisitos de segurança

| ID | Requisito | ASVS | Como é verificado |
|----|-----------|------|-------------------|
| RS01 | A API rejeita token com assinatura inválida, expirado ou emitido para outro app client | V3.5.3 | teste `api/test/auth.test.ts` |
| RS02 | O usuário não pode alterar `custom:empresa_id` | V4.1.3 | `write_attributes` em `cognito.tf` |
| RS03 | Senha com no mínimo 12 caracteres e MFA obrigatório | V2.1.1, V2.8 | `cognito.tf` |
| RS04 | Mensagem de erro no login não revela se o usuário existe | V2.2 | `prevent_user_existence_errors` em `cognito.tf` |
| RS05 | Limite de tentativas de login por IP | V2.2.1 | WAF regional associado ao user pool |
| RS06 | Modo de autenticação de desenvolvimento não pode ligar em produção | V14.1 | `config.ts` aborta a inicialização; teste `api/test/config.test.ts` |
| RS07 | Token não aparece nos logs | V7.1.1 | `redact` do logger em `app.ts` |

## Critérios de aceite

- [ ] Dado um token válido do grupo `escritorio`, quando chamo `/api/me`, então recebo perfil `escritorio`.
- [ ] Dado um token de outro app client, quando chamo qualquer rota, então recebo 401.
- [ ] Dado `NODE_ENV=production` e `AUTH_MODE=dev`, quando a API inicia, então ela encerra com erro.
