import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { naoEncontrado } from '../erros.js';
import { exigir, GESTAO, TODOS } from '../rbac.js';
import { data, id, obraVisivel, pObra, texto, textoOpcional } from './comum.js';

const corpoObra = z
  .object({
    codigo: texto(30),
    nome: texto(200),
    endereco: textoOpcional(300),
    clienteNome: textoOpcional(200),
    status: z.enum(['planejada', 'em_andamento', 'paralisada', 'concluida']).default('planejada'),
    dataInicio: data.nullish(),
    dataPrevistaFim: data.nullish(),
  })
  .strict()
  .refine((o) => !o.dataInicio || !o.dataPrevistaFim || o.dataPrevistaFim >= o.dataInicio, {
    message: 'Término previsto antes do início',
    path: ['dataPrevistaFim'],
  });

const SELECT_OBRA = `select o.id, o.codigo, o.nome, o.endereco, o.cliente_nome as "clienteNome", o.status,
  o.data_inicio as "dataInicio", o.data_prevista_fim as "dataPrevistaFim",
  coalesce((select round(sum(e.percentual * (e.fim - e.inicio + 1)) / nullif(sum(e.fim - e.inicio + 1), 0), 2)
            from cronograma_etapas e where e.obra_id = o.id), 0) as "avancoPercentual"
  from obras o`;

export async function rotasObras(app: FastifyInstance) {
  app.get('/api/me', async (req) => {
    const u = req.usuario!;
    return { id: u.usuarioId, nome: u.nome, email: u.email, perfil: u.perfil, empresaId: u.empresaId };
  });

  // Spec 002 RF01. O filtro por empresa e por cliente é feito pelo RLS
  app.get('/api/obras', { preHandler: exigir(...TODOS) }, async (req) =>
    app.db(req, async (db) => (await db.query(`${SELECT_OBRA} order by o.criado_em desc`)).rows),
  );

  app.get('/api/obras/:obraId', { preHandler: exigir(...TODOS) }, async (req) => {
    const { obraId } = pObra.parse(req.params);
    return app.db(req, async (db) => {
      const r = await db.query(`${SELECT_OBRA} where o.id = $1`, [obraId]);
      if (!r.rowCount) throw naoEncontrado('Obra');
      return r.rows[0];
    });
  });

  app.post('/api/obras', { preHandler: exigir(...GESTAO) }, async (req, reply) => {
    const b = corpoObra.parse(req.body);
    const u = req.usuario!;
    const r = await app.db(req, (db) =>
      db.query(
        `insert into obras (empresa_id, codigo, nome, endereco, cliente_nome, status, data_inicio, data_prevista_fim)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [u.empresaId, b.codigo, b.nome, b.endereco, b.clienteNome, b.status, b.dataInicio ?? null, b.dataPrevistaFim ?? null],
      ),
    );
    return reply.status(201).send({ id: r.rows[0].id });
  });

  app.put('/api/obras/:obraId', { preHandler: exigir(...GESTAO) }, async (req) => {
    const { obraId } = pObra.parse(req.params);
    const b = corpoObra.parse(req.body);
    const r = await app.db(req, (db) =>
      db.query(
        `update obras set codigo = $2, nome = $3, endereco = $4, cliente_nome = $5, status = $6,
           data_inicio = $7, data_prevista_fim = $8 where id = $1 returning id`,
        [obraId, b.codigo, b.nome, b.endereco, b.clienteNome, b.status, b.dataInicio ?? null, b.dataPrevistaFim ?? null],
      ),
    );
    if (!r.rowCount) throw naoEncontrado('Obra');
    return { id: obraId };
  });

  // Spec 002 RN03
  app.delete('/api/obras/:obraId', { preHandler: exigir('admin') }, async (req, reply) => {
    const { obraId } = pObra.parse(req.params);
    const r = await app.db(req, async (db) => {
      await db.query('delete from medicao_itens where obra_id = $1', [obraId]);
      return db.query('delete from obras where id = $1', [obraId]);
    });
    if (!r.rowCount) throw naoEncontrado('Obra');
    return reply.status(204).send();
  });

  // Spec 002 RF02: clientes vinculados à obra
  app.get('/api/obras/:obraId/clientes', { preHandler: exigir(...GESTAO) }, async (req) => {
    const { obraId } = pObra.parse(req.params);
    return app.db(req, async (db) => {
      await obraVisivel(db, obraId);
      const r = await db.query(
        `select u.id, u.nome, u.email from obra_clientes oc join usuarios u on u.id = oc.usuario_id
         where oc.obra_id = $1 order by u.nome`,
        [obraId],
      );
      return r.rows;
    });
  });

  app.post('/api/obras/:obraId/clientes', { preHandler: exigir(...GESTAO) }, async (req, reply) => {
    const { obraId } = pObra.parse(req.params);
    const { usuarioId } = z.object({ usuarioId: id }).strict().parse(req.body);
    const u = req.usuario!;
    await app.db(req, async (db) => {
      await obraVisivel(db, obraId);
      // O usuário precisa ser da mesma empresa (RLS) e ter perfil cliente
      const c = await db.query(`select id from usuarios where id = $1 and perfil = 'cliente' and empresa_id = $2`, [
        usuarioId,
        u.empresaId,
      ]);
      if (!c.rowCount) throw naoEncontrado('Usuário cliente');
      await db.query(
        'insert into obra_clientes (empresa_id, obra_id, usuario_id) values ($1, $2, $3) on conflict do nothing',
        [u.empresaId, obraId, usuarioId],
      );
    });
    return reply.status(201).send({ obraId, usuarioId });
  });

  app.delete('/api/obras/:obraId/clientes/:usuarioId', { preHandler: exigir(...GESTAO) }, async (req, reply) => {
    const p = z.object({ obraId: id, usuarioId: id }).parse(req.params);
    await app.db(req, (db) =>
      db.query('delete from obra_clientes where obra_id = $1 and usuario_id = $2', [p.obraId, p.usuarioId]),
    );
    return reply.status(204).send();
  });
}
