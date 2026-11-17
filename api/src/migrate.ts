/**
 * Aplica as migrações SQL em ordem. Roda como tarefa ECS separada no deploy,
 * com o usuário mestre do RDS (credencial injetada pelo Secrets Manager).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = fileURLToPath(new URL('../migrations', import.meta.url));
const env = process.env;

const ssl = env.DB_SSL === 'true' ? { rejectUnauthorized: true, ca: env.DB_CA_FILE ? readFileSync(env.DB_CA_FILE, 'utf8') : undefined } : undefined;

const client = new pg.Client({
  host: env.DB_HOST ?? 'localhost',
  port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME ?? 'obras',
  user: env.MIGRATE_DB_USER ?? 'postgres',
  password: env.MIGRATE_DB_PASSWORD,
  ssl,
});

await client.connect();
try {
  await client.query('select pg_advisory_lock(727001)');
  await client.query(`create table if not exists schema_migrations (
    arquivo text primary key, aplicado_em timestamptz not null default now())`);
  const feitas = new Set((await client.query('select arquivo from schema_migrations')).rows.map((r) => r.arquivo));
  const arquivos = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const arq of arquivos) {
    if (feitas.has(arq)) continue;
    console.log(`Aplicando ${arq}`);
    await client.query('begin');
    try {
      await client.query(readFileSync(`${dir}/${arq}`, 'utf8'));
      await client.query('insert into schema_migrations (arquivo) values ($1)', [arq]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    }
  }

  // Forma de login do usuário da aplicação
  if (env.DB_IAM_AUTH === 'true') {
    await client.query('grant rds_iam to app_user'); // RDS: autenticação por token IAM, sem senha
  } else if (env.APP_DB_PASSWORD) {
    await client.query(`alter role app_user password ${client.escapeLiteral(env.APP_DB_PASSWORD)}`);
  }
  console.log('Migrações concluídas');
} finally {
  await client.query('select pg_advisory_unlock(727001)').catch(() => undefined);
  await client.end();
}
