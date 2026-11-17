/**
 * Cadastra uma construtora (empresa) e imprime o id dela.
 * Em produção roda como tarefa ECS avulsa (scripts/criar-empresa.sh),
 * porque o banco fica numa subnet isolada sem acesso de fora.
 *   node dist/criar-empresa.js "Construtora Exemplo" 12.345.678/0001-90
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const [nome, cnpj] = process.argv.slice(2);
if (!nome || nome.trim().length < 2) {
  console.error('Uso: criar-empresa "Nome da construtora" [CNPJ]');
  process.exit(1);
}

const env = process.env;
const client = new pg.Client({
  host: env.DB_HOST ?? 'localhost',
  port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME ?? 'obras',
  user: env.MIGRATE_DB_USER ?? 'postgres',
  password: env.MIGRATE_DB_PASSWORD,
  ssl:
    env.DB_SSL === 'true'
      ? { rejectUnauthorized: true, ca: env.DB_CA_FILE ? readFileSync(env.DB_CA_FILE, 'utf8') : undefined }
      : undefined,
});

const id = randomUUID();
await client.connect();
try {
  await client.query('begin');
  // A política RLS de empresas exige que o id seja o do contexto
  await client.query(`select set_config('app.empresa_id', $1, true)`, [id]);
  await client.query('insert into empresas (id, nome, cnpj) values ($1, $2, $3)', [id, nome.trim(), cnpj ?? null]);
  await client.query('commit');
  console.log(`EMPRESA_ID=${id}`);
} finally {
  await client.end();
}
