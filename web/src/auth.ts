import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

// A configuração de login vem da API (/api/config) em tempo de execução,
// assim a mesma imagem serve qualquer ambiente sem recompilar o frontend.
interface ConfigLogin {
  authMode: 'dev' | 'cognito';
  cognitoAuthority: string | null;
  cognitoClientId: string | null;
  cognitoDomain: string | null;
}

export let MODO: 'dev' | 'cognito' = 'cognito';
let config: ConfigLogin | null = null;
let gerenciador: UserManager | null = null;
const origem = window.location.origin;
const CHAVE_DEV = 'dev-sub';

export async function iniciarAuth() {
  const r = await fetch('/api/config');
  if (!r.ok) throw new Error('Não foi possível carregar a configuração');
  config = (await r.json()) as ConfigLogin;
  MODO = config.authMode === 'dev' ? 'dev' : 'cognito';
  if (MODO === 'cognito') {
    // Login pelo Cognito com Authorization Code + PKCE (spec 001 RF01).
    // Tokens ficam no sessionStorage: somem ao fechar a aba.
    gerenciador = new UserManager({
      authority: config.cognitoAuthority!,
      client_id: config.cognitoClientId!,
      redirect_uri: `${origem}/callback`,
      post_logout_redirect_uri: `${origem}/`,
      response_type: 'code',
      scope: 'openid email profile',
      userStore: new WebStorageStateStore({ store: window.sessionStorage }),
      automaticSilentRenew: true,
    });
  }
}

export async function obterToken(): Promise<string | null> {
  if (MODO === 'dev') {
    const sub = sessionStorage.getItem(CHAVE_DEV);
    return sub ? `dev:${sub}` : null;
  }
  const u = await gerenciador!.getUser();
  if (!u || u.expired) return null;
  // A API valida o ID token (tem e-mail, grupos e empresa)
  return u.id_token ?? null;
}

export async function entrar() {
  if (MODO === 'dev') {
    window.location.assign('/dev-login');
    return;
  }
  await gerenciador!.signinRedirect();
}

export function entrarDev(sub: string) {
  sessionStorage.setItem(CHAVE_DEV, sub);
  window.location.assign('/');
}

export async function concluirLogin() {
  await gerenciador!.signinRedirectCallback();
}

export async function sair() {
  if (MODO === 'dev') {
    sessionStorage.removeItem(CHAVE_DEV);
    window.location.assign('/');
    return;
  }
  await gerenciador!.removeUser();
  // Encerra também a sessão no Cognito (spec 001 RF06)
  const params = new URLSearchParams({ client_id: config!.cognitoClientId!, logout_uri: `${origem}/` });
  window.location.assign(`${config!.cognitoDomain}/logout?${params}`);
}
