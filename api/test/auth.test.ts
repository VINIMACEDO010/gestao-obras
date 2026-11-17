import { createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verificadorCognito } from '../src/auth.js';
import { carregarConfig } from '../src/config.js';

// Gera um par de chaves próprio e entrega o JWKS ao verificador (como no deploy)
const POOL = 'us-east-1_TESTE123';
const CLIENTE = 'app-client-teste';
const ISS = `https://cognito-idp.us-east-1.amazonaws.com/${POOL}`;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(payload: Record<string, unknown>) {
  const cabecalho = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const corpo = b64(payload);
  const s = createSign('RSA-SHA256');
  s.update(`${cabecalho}.${corpo}`);
  return `${cabecalho}.${corpo}.${s.sign(privateKey).toString('base64url')}`;
}

const agora = Math.floor(Date.now() / 1000);
const base = {
  sub: 'abc-123',
  iss: ISS,
  aud: CLIENTE,
  token_use: 'id',
  exp: agora + 3600,
  iat: agora,
  auth_time: agora,
  email: 'ana@teste.dev',
  name: 'Ana',
  'cognito:groups': ['escritorio'],
  'custom:empresa_id': '11111111-1111-4111-8111-111111111111',
};

const verificar = verificadorCognito(
  carregarConfig({
    NODE_ENV: 'test',
    COGNITO_USER_POOL_ID: POOL,
    COGNITO_CLIENT_ID: CLIENTE,
    COGNITO_JWKS: JSON.stringify({ keys: [jwk] }),
    DB_IAM_AUTH: 'true',
  } as NodeJS.ProcessEnv),
);

describe('verificador Cognito (spec 001 RS01)', () => {
  it('aceita token válido e extrai perfil e empresa', async () => {
    const id = await verificar(token(base));
    expect(id).toMatchObject({ sub: 'abc-123', perfil: 'escritorio', empresaId: base['custom:empresa_id'] });
  });

  it('rejeita token de outro app client', async () => {
    await expect(verificar(token({ ...base, aud: 'outro-app' }))).rejects.toMatchObject({ status: 401 });
  });

  it('rejeita token expirado', async () => {
    await expect(verificar(token({ ...base, exp: agora - 10 }))).rejects.toMatchObject({ status: 401 });
  });

  it('rejeita token de outro emissor', async () => {
    await expect(verificar(token({ ...base, iss: 'https://atacante.dev' }))).rejects.toMatchObject({ status: 401 });
  });

  it('rejeita access token no lugar do id token', async () => {
    await expect(verificar(token({ ...base, token_use: 'access' }))).rejects.toMatchObject({ status: 401 });
  });

  it('rejeita assinatura adulterada', async () => {
    const t = token(base);
    const [h, , s] = t.split('.');
    const adulterado = `${h}.${b64({ ...base, 'cognito:groups': ['admin'] })}.${s}`;
    await expect(verificar(adulterado)).rejects.toMatchObject({ status: 401 });
  });

  it('ignora empresa_id que não é UUID', async () => {
    const id = await verificar(token({ ...base, 'custom:empresa_id': "1' or '1'='1" }));
    expect(id.empresaId).toBeUndefined();
  });
});
