/**
 * Dados de exemplo para desenvolvimento local (AUTH_MODE=dev).
 * Cria duas construtoras para demonstrar o isolamento.
 * Login no frontend local: escolha um dos usuários "dev:...".
 */
import pg from 'pg';

const client = new pg.Client({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? 'obras',
  user: process.env.MIGRATE_DB_USER ?? 'postgres',
  password: process.env.MIGRATE_DB_PASSWORD,
});

const E1 = '11111111-1111-4111-8111-111111111111';
const E2 = '22222222-2222-4222-8222-222222222222';

await client.connect();
const ctx = (empresa: string) =>
  client.query(`select set_config('app.empresa_id', $1, false), set_config('app.perfil', 'admin', false)`, [empresa]);

for (const [id, nome] of [
  [E1, 'Construtora Alto Vale'],
  [E2, 'Construtora Litoral'],
]) {
  await ctx(id);
  await client.query('insert into empresas (id, nome) values ($1, $2) on conflict do nothing', [id, nome]);
}

const usuarios: [string, string, string, string, string][] = [
  ['dev-admin', E1, 'Ana Admin', 'ana@altovale.dev', 'admin'],
  ['dev-escritorio', E1, 'Bruno Escritório', 'bruno@altovale.dev', 'escritorio'],
  ['dev-canteiro', E1, 'Carlos Encarregado', 'carlos@altovale.dev', 'canteiro'],
  ['dev-cliente', E1, 'Diana Cliente', 'diana@cliente.dev', 'cliente'],
  ['dev-outra-empresa', E2, 'Eduardo Litoral', 'eduardo@litoral.dev', 'admin'],
];
for (const [sub, emp, nome, email, perfil] of usuarios) {
  await ctx(emp);
  await client.query(
    `insert into usuarios (cognito_sub, empresa_id, nome, email, perfil) values ($1, $2, $3, $4, $5)
     on conflict (cognito_sub) do nothing`,
    [sub, emp, nome, email, perfil],
  );
}

await ctx(E1);
const obra = await client.query(
  `insert into obras (empresa_id, codigo, nome, endereco, cliente_nome, status, data_inicio, data_prevista_fim)
   values ($1, 'OB-001', 'Residencial Bela Vista', 'Rua das Palmeiras, 100 - Rio do Sul/SC', 'Diana Cliente',
           'em_andamento', '2026-09-01', '2027-06-30')
   on conflict (empresa_id, codigo) do update set nome = excluded.nome returning id`,
  [E1],
);
const obraId = obra.rows[0].id;
const cliente = await client.query(`select id from usuarios where cognito_sub = 'dev-cliente'`);
await client.query(
  'insert into obra_clientes (empresa_id, obra_id, usuario_id) values ($1, $2, $3) on conflict do nothing',
  [E1, obraId, cliente.rows[0].id],
);

const itens = [
  ['01.01', 'Escavação de fundações', 'm³', '120', '45.00'],
  ['02.01', 'Concreto estrutural fck 30 MPa', 'm³', '85', '620.00'],
  ['03.01', 'Alvenaria de vedação', 'm²', '940', '78.50'],
  ['04.01', 'Reboco interno', 'm²', '1650', '32.00'],
];
for (const [codigo, descricao, unidade, qtd, valor] of itens) {
  await client.query(
    `insert into orcamento_itens (empresa_id, obra_id, codigo, descricao, unidade, quantidade, valor_unitario)
     values ($1, $2, $3, $4, $5, $6, $7) on conflict (obra_id, codigo) do nothing`,
    [E1, obraId, codigo, descricao, unidade, qtd, valor],
  );
}

const etapas = [
  [1, 'Fundações', '2026-09-01', '2026-10-15', '100'],
  [2, 'Estrutura', '2026-10-10', '2027-01-31', '45'],
  [3, 'Alvenaria', '2027-01-15', '2027-03-31', '0'],
  [4, 'Acabamentos', '2027-03-15', '2027-06-30', '0'],
];
const existe = await client.query('select 1 from cronograma_etapas where obra_id = $1', [obraId]);
if (!existe.rowCount) {
  for (const [ordem, nome, inicio, fim, perc] of etapas) {
    await client.query(
      `insert into cronograma_etapas (empresa_id, obra_id, ordem, nome, inicio, fim, percentual)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [E1, obraId, ordem, nome, inicio, fim, perc],
    );
  }
}

await ctx(E2);
await client.query(
  `insert into obras (empresa_id, codigo, nome, status) values ($1, 'LT-001', 'Galpão Litoral', 'planejada')
   on conflict (empresa_id, codigo) do nothing`,
  [E2],
);

await client.end();
console.log('Seed concluído. Usuários: dev-admin, dev-escritorio, dev-canteiro, dev-cliente, dev-outra-empresa');
