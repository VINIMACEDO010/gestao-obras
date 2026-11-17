import { readFileSync } from 'node:fs';
import pg from 'pg';
import { Signer } from '@aws-sdk/rds-signer';
import type { Config } from './config.js';

// numeric -> string evita perda de precisão; datas (date) ficam como texto YYYY-MM-DD
pg.types.setTypeParser(1082, (v) => v);

export interface Contexto {
  empresaId: string | null;
  usuarioId: string | null;
  perfil: string;
  sub?: string | null;
}

export type Cliente = pg.PoolClient;

export function criarPool(cfg: Config): pg.Pool {
  let password: string | (() => Promise<string>) | undefined = cfg.DB_PASSWORD;
  if (cfg.DB_IAM_AUTH) {
    // Autenticação IAM no RDS: o token é assinado localmente com a role da tarefa ECS,
    // vale 15 minutos e é gerado a cada nova conexão. Nenhuma senha fica na aplicação.
    const signer = new Signer({
      hostname: cfg.DB_HOST,
      port: cfg.DB_PORT,
      username: cfg.DB_USER,
      region: cfg.AWS_REGION,
    });
    password = () => signer.getAuthToken();
  }
  return new pg.Pool({
    host: cfg.DB_HOST,
    port: cfg.DB_PORT,
    database: cfg.DB_NAME,
    user: cfg.DB_USER,
    password,
    // Certificado da AWS (global-bundle.pem) é copiado para a imagem no build
    ssl: cfg.DB_SSL
      ? { rejectUnauthorized: true, ca: cfg.DB_CA_FILE ? readFileSync(cfg.DB_CA_FILE, 'utf8') : undefined }
      : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  });
}

/**
 * Executa fn numa transação com o contexto de segurança definido.
 * As políticas RLS do banco leem esses valores (spec 002).
 */
export async function comContexto<T>(pool: pg.Pool, ctx: Contexto, fn: (c: Cliente) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(
      `select set_config('app.empresa_id', $1, true), set_config('app.usuario_id', $2, true),
              set_config('app.perfil', $3, true), set_config('app.sub', $4, true)`,
      [ctx.empresaId ?? '', ctx.usuarioId ?? '', ctx.perfil, ctx.sub ?? ''],
    );
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}
