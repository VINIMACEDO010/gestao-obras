/**
 * Testes de integração com PostgreSQL real (specs 002 a 009).
 * Usa o banco definido em TEST_DB_* (padrão: localhost, postgres/postgres).
 * No CI o banco vem do "services: postgres" do GitHub Actions.
 */
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { criarApp } from '../src/app.js';
import { verificadorDev } from '../src/auth.js';
import { carregarConfig } from '../src/config.js';
import { criarPool } from '../src/db.js';
import type { Job, Servicos } from '../src/servicos.js';

const HOST = process.env.TEST_DB_HOST ?? 'localhost';
const PORTA = process.env.TEST_DB_PORT ?? '5432';
const SUPER = process.env.TEST_DB_USER ?? 'postgres';
const SENHA = process.env.TEST_DB_PASSWORD ?? 'postgres';
const BANCO = 'obras_teste';
const SENHA_APP = 'senha_teste_app';

async function bancoDisponivel() {
  const c = new pg.Client({ host: HOST, port: Number(PORTA), user: SUPER, password: SENHA, database: 'postgres' });
  try {
    await c.connect();
    await c.query(`drop database if exists ${BANCO} with (force)`);
    await c.query(`create database ${BANCO}`);
    return true;
  } catch {
    return false;
  } finally {
    await c.end().catch(() => undefined);
  }
}

const disponivel = await bancoDisponivel();
const jobs: Job[] = [];
const servicosFalsos: Servicos = {
  novaChave: (p, e) => `${p}/arquivo-teste.${e}`,
  uploadAssinado: async (chave, ct) => ({ url: 'https://s3.teste/upload', campos: { key: chave, 'Content-Type': ct } }),
  downloadAssinado: async (chave) => `https://s3.teste/${chave}?assinado`,
  enfileirar: async (j) => {
    jobs.push(j);
  },
};

let app: FastifyInstance;
let pool: pg.Pool;
let obraA: string; // obra da empresa 1 (cliente vinculado)

const req = (usuario: string, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as 'GET', url, payload: payload as object, headers: { authorization: `Bearer dev:${usuario}` } });

describe.skipIf(!disponivel)('integração com PostgreSQL', () => {
  beforeAll(async () => {
    const env = {
      ...process.env,
      DB_HOST: HOST,
      DB_PORT: PORTA,
      DB_NAME: BANCO,
      MIGRATE_DB_USER: SUPER,
      MIGRATE_DB_PASSWORD: SENHA,
      APP_DB_PASSWORD: SENHA_APP,
    };
    execFileSync('npx', ['tsx', 'src/migrate.ts'], { env, stdio: 'pipe' });
    execFileSync('npx', ['tsx', 'src/seed-dev.ts'], { env, stdio: 'pipe' });

    const cfg = carregarConfig({
      NODE_ENV: 'test',
      AUTH_MODE: 'dev',
      DB_HOST: HOST,
      DB_PORT: PORTA,
      DB_NAME: BANCO,
      DB_USER: 'app_user',
      DB_PASSWORD: SENHA_APP,
    } as NodeJS.ProcessEnv);
    pool = criarPool(cfg);
    app = await criarApp({ cfg, pool, verificar: verificadorDev(), servicos: servicosFalsos });
    const r = await req('dev-admin', 'GET', '/api/obras');
    obraA = r.json()[0].id;
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  describe('autenticação e RBAC (specs 001 e README)', () => {
    it('sem token responde 401', async () => {
      const r = await app.inject({ method: 'GET', url: '/api/obras' });
      expect(r.statusCode).toBe(401);
    });

    it('usuário inexistente responde 403', async () => {
      expect((await req('dev-fantasma', 'GET', '/api/obras')).statusCode).toBe(403);
    });

    it('canteiro não cria obra', async () => {
      expect((await req('dev-canteiro', 'POST', '/api/obras', { codigo: 'X', nome: 'Y' })).statusCode).toBe(403);
    });

    it('escritório não exclui obra (só admin)', async () => {
      expect((await req('dev-escritorio', 'DELETE', `/api/obras/${obraA}`)).statusCode).toBe(403);
    });

    it('auditoria só para admin', async () => {
      expect((await req('dev-escritorio', 'GET', '/api/auditoria')).statusCode).toBe(403);
    });

    it('corpo com campo extra (empresaId) é recusado', async () => {
      const r = await req('dev-admin', 'POST', '/api/obras', {
        codigo: 'Z1',
        nome: 'Teste',
        empresaId: '22222222-2222-4222-8222-222222222222',
      });
      expect(r.statusCode).toBe(400);
    });
  });

  describe('isolamento entre empresas (spec 002)', () => {
    it('outra empresa não vê a obra (404, sem confirmar existência)', async () => {
      const r = await req('dev-outra-empresa', 'GET', `/api/obras/${obraA}`);
      expect(r.statusCode).toBe(404);
    });

    it('outra empresa não lista obras alheias', async () => {
      const r = await req('dev-outra-empresa', 'GET', '/api/obras');
      expect(r.json().map((o: { codigo: string }) => o.codigo)).toEqual(['LT-001']);
    });

    it('outra empresa não altera nem lê orçamento alheio', async () => {
      expect((await req('dev-outra-empresa', 'GET', `/api/obras/${obraA}/orcamento`)).statusCode).toBe(404);
      const r = await req('dev-outra-empresa', 'PUT', `/api/obras/${obraA}`, { codigo: 'H', nome: 'Hack' });
      expect(r.statusCode).toBe(404);
    });

    it('RLS barra mesmo SQL direto sem filtro de empresa', async () => {
      // Simula um bug na API: consulta sem WHERE, com contexto da empresa 2
      const c = await pool.connect();
      try {
        await c.query('begin');
        await c.query(`select set_config('app.empresa_id', '22222222-2222-4222-8222-222222222222', true),
                              set_config('app.perfil', 'admin', true)`);
        const r = await c.query('select codigo from obras');
        expect(r.rows.map((o) => o.codigo)).toEqual(['LT-001']);
        const u = await c.query(`update orcamento_itens set valor_unitario = 0`);
        expect(u.rowCount).toBe(0);
        await c.query('rollback');
      } finally {
        c.release();
      }
    });

    it('sem contexto de empresa o banco não devolve nada', async () => {
      const r = await pool.query('select count(*)::int as n from obras');
      expect(r.rows[0].n).toBe(0);
    });
  });

  describe('cliente da obra (spec 008)', () => {
    it('vê só a obra vinculada, sem compras', async () => {
      const r = await req('dev-cliente', 'GET', '/api/obras');
      expect(r.json()).toHaveLength(1);
      expect((await req('dev-cliente', 'GET', `/api/obras/${obraA}/compras`)).statusCode).toBe(403);
    });

    it('banco nega compras ao cliente mesmo com SQL direto', async () => {
      const c = await pool.connect();
      try {
        await c.query('begin');
        const u = await c.query(`select id from usuarios where cognito_sub = 'dev-cliente'`);
        await c.query(
          `select set_config('app.empresa_id', '11111111-1111-4111-8111-111111111111', true),
                  set_config('app.perfil', 'cliente', true), set_config('app.usuario_id', $1, true)`,
          [u.rows[0]?.id ?? ''],
        );
        expect((await c.query('select * from compras')).rowCount).toBe(0);
        await expect(c.query(`update obras set nome = 'x'`)).resolves.toMatchObject({ rowCount: 0 });
        await c.query('rollback');
      } finally {
        c.release();
      }
    });

    it('não grava nada', async () => {
      const r = await req('dev-cliente', 'POST', `/api/obras/${obraA}/diarios`, {
        data: '2026-11-01',
        clima: 'sol',
        efetivo: 1,
        atividades: 'x',
      });
      expect(r.statusCode).toBe(403);
    });

    it('obra não vinculada some para o cliente', async () => {
      const nova = await req('dev-admin', 'POST', '/api/obras', { codigo: 'OB-NV', nome: 'Obra sem cliente' });
      expect(nova.statusCode).toBe(201);
      expect((await req('dev-cliente', 'GET', `/api/obras/${nova.json().id}`)).statusCode).toBe(404);
    });
  });

  describe('compras (spec 005)', () => {
    it('canteiro solicita, não aprova; escritório aprova; recebida não cancela', async () => {
      const c = await req('dev-canteiro', 'POST', `/api/obras/${obraA}/compras`, {
        descricao: 'Areia média',
        quantidade: 10,
        unidade: 'm³',
      });
      expect(c.statusCode).toBe(201);
      const url = `/api/obras/${obraA}/compras/${c.json().id}/status`;
      expect((await req('dev-canteiro', 'PATCH', url, { status: 'aprovada' })).statusCode).toBe(403);
      expect((await req('dev-escritorio', 'PATCH', url, { status: 'aprovada' })).statusCode).toBe(200);
      expect((await req('dev-escritorio', 'PATCH', url, { status: 'recebida' })).statusCode).toBe(200);
      expect((await req('dev-escritorio', 'PATCH', url, { status: 'cancelada' })).statusCode).toBe(409);
    });
  });

  describe('orçamento, cronograma e medições (specs 003, 004, 007)', () => {
    it('recusa quantidade zero e etapa com fim antes do início', async () => {
      const o = await req('dev-escritorio', 'POST', `/api/obras/${obraA}/orcamento`, {
        codigo: '9.9',
        descricao: 'X',
        unidade: 'un',
        quantidade: 0,
        valorUnitario: 1,
      });
      expect(o.statusCode).toBe(400);
      const e = await req('dev-escritorio', 'POST', `/api/obras/${obraA}/cronograma`, {
        nome: 'X',
        inicio: '2026-12-10',
        fim: '2026-12-01',
        percentual: 0,
      });
      expect(e.statusCode).toBe(400);
    });

    it('medição: bloqueia acumulado acima do orçado e fecha dentro do limite', async () => {
      const orc = (await req('dev-escritorio', 'GET', `/api/obras/${obraA}/orcamento`)).json();
      const escavacao = orc.itens.find((i: { codigo: string }) => i.codigo === '01.01'); // 120 m³

      const m1 = await req('dev-escritorio', 'POST', `/api/obras/${obraA}/medicoes`, {
        periodoInicio: '2026-09-01',
        periodoFim: '2026-09-30',
      });
      expect(m1.statusCode).toBe(201);
      expect(m1.json().numero).toBe(1);
      // cliente não vê medição em rascunho (spec 008)
      expect((await req('dev-cliente', 'GET', `/api/obras/${obraA}/medicoes/${m1.json().id}`)).statusCode).toBe(404);
      // segunda em rascunho não pode
      const dup = await req('dev-escritorio', 'POST', `/api/obras/${obraA}/medicoes`, {
        periodoInicio: '2026-10-01',
        periodoFim: '2026-10-31',
      });
      expect(dup.statusCode).toBe(409);

      const base = `/api/obras/${obraA}/medicoes/${m1.json().id}`;
      await req('dev-escritorio', 'PUT', `${base}/itens`, [{ orcamentoItemId: escavacao.id, quantidade: 150 }]);
      expect((await req('dev-escritorio', 'POST', `${base}/fechar`)).statusCode).toBe(409);

      const put = await req('dev-escritorio', 'PUT', `${base}/itens`, [{ orcamentoItemId: escavacao.id, quantidade: 80 }]);
      const item = put.json().itens.find((i: { codigo: string }) => i.codigo === '01.01');
      expect(item.valorPeriodo).toBe('3600.00');
      expect(item.percentualAcumulado).toBe('66.67');

      expect((await req('dev-escritorio', 'POST', `${base}/fechar`)).statusCode).toBe(200);
      expect(jobs.some((j) => j.tipo === 'pdf_medicao')).toBe(true);
      // fechada não altera
      const alt = await req('dev-escritorio', 'PUT', `${base}/itens`, [{ orcamentoItemId: escavacao.id, quantidade: 1 }]);
      expect(alt.statusCode).toBe(409);

      // medição 2: 80 já medidos + 50 = 130 > 120
      const m2 = await req('dev-escritorio', 'POST', `/api/obras/${obraA}/medicoes`, {
        periodoInicio: '2026-10-01',
        periodoFim: '2026-10-31',
      });
      expect(m2.json().numero).toBe(2);
      const b2 = `/api/obras/${obraA}/medicoes/${m2.json().id}`;
      await req('dev-escritorio', 'PUT', `${b2}/itens`, [{ orcamentoItemId: escavacao.id, quantidade: 50 }]);
      const f2 = await req('dev-escritorio', 'POST', `${b2}/fechar`);
      expect(f2.statusCode).toBe(409);
      expect(f2.json().erro).toContain('01.01');

      // cliente lê a medição fechada
      expect((await req('dev-cliente', 'GET', base)).statusCode).toBe(200);
    });

    it('item já medido não pode ser excluído do orçamento', async () => {
      const orc = (await req('dev-escritorio', 'GET', `/api/obras/${obraA}/orcamento`)).json();
      const escavacao = orc.itens.find((i: { codigo: string }) => i.codigo === '01.01');
      const r = await req('dev-escritorio', 'DELETE', `/api/obras/${obraA}/orcamento/${escavacao.id}`);
      expect(r.statusCode).toBe(409);
    });
  });

  describe('diário de obra (spec 006)', () => {
    it('fluxo completo: criar, foto, confirmar, fechar, bloquear edição', async () => {
      const d = await req('dev-canteiro', 'POST', `/api/obras/${obraA}/diarios`, {
        data: '2026-11-10',
        clima: 'sol',
        efetivo: 12,
        atividades: 'Concretagem da laje do 2º pavimento',
      });
      expect(d.statusCode).toBe(201);
      const base = `/api/obras/${obraA}/diarios/${d.json().id}`;

      // mesmo dia duplicado
      const dup = await req('dev-canteiro', 'POST', `/api/obras/${obraA}/diarios`, {
        data: '2026-11-10',
        clima: 'sol',
        efetivo: 1,
        atividades: 'x',
      });
      expect(dup.statusCode).toBe(409);

      // tipo não permitido
      expect((await req('dev-canteiro', 'POST', `${base}/fotos`, { contentType: 'image/svg+xml' })).statusCode).toBe(400);

      const f = await req('dev-canteiro', 'POST', `${base}/fotos`, { contentType: 'image/jpeg', legenda: 'Laje' });
      expect(f.statusCode).toBe(201);
      // a chave no S3 é montada pelo servidor com empresa/obra/diário
      expect(f.json().upload.campos.key).toMatch(/^11111111-1111-4111-8111-111111111111\//);
      expect((await req('dev-canteiro', 'POST', `${base}/fotos/${f.json().fotoId}/confirmar`)).statusCode).toBe(202);
      expect(jobs.some((j) => j.tipo === 'validar_foto')).toBe(true);

      // foto pendente não gera link
      expect((await req('dev-canteiro', 'GET', `${base}/fotos/${f.json().fotoId}/url`)).statusCode).toBe(404);
      // cliente não vê foto pendente
      const visto = (await req('dev-cliente', 'GET', base)).json();
      expect(visto.fotos).toHaveLength(0);

      expect((await req('dev-canteiro', 'POST', `${base}/fechar`)).statusCode).toBe(200);
      expect(jobs.some((j) => j.tipo === 'pdf_diario')).toBe(true);
      const edit = await req('dev-canteiro', 'PUT', base, {
        data: '2026-11-10',
        clima: 'chuva',
        efetivo: 12,
        atividades: 'alterado',
      });
      expect(edit.statusCode).toBe(409);
      expect((await req('dev-canteiro', 'POST', `${base}/fotos`, { contentType: 'image/png' })).statusCode).toBe(409);
    });
  });

  describe('auditoria (spec 009)', () => {
    it('registra antes e depois com o usuário', async () => {
      const orc = (await req('dev-escritorio', 'GET', `/api/obras/${obraA}/orcamento`)).json();
      const item = orc.itens.find((i: { codigo: string }) => i.codigo === '04.01');
      await req('dev-escritorio', 'PUT', `/api/obras/${obraA}/orcamento/${item.id}`, {
        codigo: '04.01',
        descricao: item.descricao,
        unidade: item.unidade,
        quantidade: item.quantidade,
        valorUnitario: '35.00',
      });
      const a = (await req('dev-admin', 'GET', '/api/auditoria?tabela=orcamento_itens&limite=5')).json();
      const reg = a.find((x: { registroId: string; acao: string }) => x.registroId === item.id && x.acao === 'UPDATE');
      expect(reg.usuario).toBe('Bruno Escritório');
      expect(reg.dadosAntes.valor_unitario).toBe(32);
      expect(reg.dadosDepois.valor_unitario).toBe(35);
    });

    it('usuário da aplicação não altera nem apaga a auditoria', async () => {
      await expect(pool.query('delete from auditoria')).rejects.toMatchObject({ code: '42501' });
      await expect(pool.query(`update auditoria set acao = 'INSERT'`)).rejects.toMatchObject({ code: '42501' });
      await expect(
        pool.query(`insert into auditoria (empresa_id, tabela, acao) values (gen_random_uuid(), 'x', 'INSERT')`),
      ).rejects.toMatchObject({ code: '42501' });
    });

    it('outra empresa não vê a auditoria alheia', async () => {
      const a = (await req('dev-outra-empresa', 'GET', '/api/auditoria')).json();
      expect(a.every((x: { tabela: string }) => x.tabela !== 'orcamento_itens')).toBe(true);
    });
  });
});
