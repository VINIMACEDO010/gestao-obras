import { describe, expect, it } from 'vitest';
import { carregarConfig } from '../src/config.js';
import { perfilDosGrupos } from '../src/rbac.js';

describe('config (spec 001 RS06)', () => {
  it('recusa AUTH_MODE=dev em produção', () => {
    expect(() =>
      carregarConfig({ NODE_ENV: 'production', AUTH_MODE: 'dev', DB_IAM_AUTH: 'true' } as NodeJS.ProcessEnv),
    ).toThrow(/não é permitido em produção/);
  });

  it('exige user pool e client id no modo cognito', () => {
    expect(() => carregarConfig({ NODE_ENV: 'production', DB_IAM_AUTH: 'true' } as NodeJS.ProcessEnv)).toThrow(
      /COGNITO_USER_POOL_ID/,
    );
  });

  it('exige senha ou autenticação IAM no banco', () => {
    expect(() => carregarConfig({ AUTH_MODE: 'dev' } as NodeJS.ProcessEnv)).toThrow(/DB_PASSWORD/);
  });

  it('aceita configuração de produção válida', () => {
    const c = carregarConfig({
      NODE_ENV: 'production',
      COGNITO_USER_POOL_ID: 'us-east-1_abc',
      COGNITO_CLIENT_ID: 'cliente',
      DB_IAM_AUTH: 'true',
    } as NodeJS.ProcessEnv);
    expect(c.DB_IAM_AUTH).toBe(true);
    expect(c.AUTH_MODE).toBe('cognito');
  });
});

describe('perfilDosGrupos (spec 001 RN02)', () => {
  it('escolhe o de maior privilégio', () => {
    expect(perfilDosGrupos(['cliente', 'escritorio'])).toBe('escritorio');
    expect(perfilDosGrupos(['canteiro', 'admin'])).toBe('admin');
  });
  it('ignora grupos desconhecidos', () => {
    expect(perfilDosGrupos(['outro'])).toBeNull();
    expect(perfilDosGrupos(undefined)).toBeNull();
  });
});
