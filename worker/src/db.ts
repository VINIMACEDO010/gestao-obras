import { readFileSync } from 'node:fs';
import pg from 'pg';
import { Signer } from '@aws-sdk/rds-signer';
import type { Config } from './config.js';

pg.types.setTypeParser(1082, (v) => v);

export function criarPool(cfg: Config): pg.Pool {
  const signer = cfg.DB_IAM_AUTH
    ? new Signer({ hostname: cfg.DB_HOST, port: cfg.DB_PORT, username: cfg.DB_USER, region: cfg.AWS_REGION })
    : null;
  return new pg.Pool({
    host: cfg.DB_HOST,
    port: cfg.DB_PORT,
    database: cfg.DB_NAME,
    user: cfg.DB_USER,
    password: signer ? () => signer.getAuthToken() : cfg.DB_PASSWORD,
    ssl: cfg.DB_SSL
      ? { rejectUnauthorized: true, ca: cfg.DB_CA_FILE ? readFileSync(cfg.DB_CA_FILE, 'utf8') : undefined }
      : undefined,
    max: 4,
  });
}

/** O worker age sempre dentro da empresa informada na mensagem, com perfil "sistema". */
export async function naEmpresa<T>(pool: pg.Pool, empresaId: string, fn: (c: pg.PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('app.empresa_id', $1, true), set_config('app.perfil', 'sistema', true)`, [
      empresaId,
    ]);
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
