import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { naoEncontrado } from '../erros.js';
import { exigir, GESTAO, TODOS } from '../rbac.js';
import { data, decimal, obraVisivel, pObra, pObraItem, texto } from './comum.js';

const corpoEtapa = z
  .object({
    ordem: z.number().int().min(0).max(10000).default(0),
    nome: texto(200),
    inicio: data,
    fim: data,
    percentual: decimal(2).refine((v) => Number(v) >= 0 && Number(v) <= 100, 'Percentual entre 0 e 100'),
  })
  .strict()
  .refine((e) => e.fim >= e.inicio, { message: 'Fim antes do início', path: ['fim'] });

export async function rotasCronograma(app: FastifyInstance) {
  app.get('/api/obras/:obraId/cronograma', { preHandler: exigir(...TODOS) }, async (req) => {
    const { obraId } = pObra.parse(req.params);
    return app.db(req, async (db) => {
      await obraVisivel(db, obraId);
      const r = await db.query(
        `select id, ordem, nome, inicio, fim, percentual from cronograma_etapas
         where obra_id = $1 order by ordem, inicio`,
        [obraId],
      );
      // Spec 004 RF02: avanço ponderado pela duração
      let peso = 0;
      let soma = 0;
      for (const e of r.rows) {
        const dias = (Date.parse(e.fim) - Date.parse(e.inicio)) / 86_400_000 + 1;
        peso += dias;
        soma += dias * Number(e.percentual);
      }
      return { etapas: r.rows, avancoPercentual: peso ? (soma / peso).toFixed(2) : '0.00' };
    });
  });

  app.post('/api/obras/:obraId/cronograma', { preHandler: exigir(...GESTAO) }, async (req, reply) => {
    const { obraId } = pObra.parse(req.params);
    const b = corpoEtapa.parse(req.body);
    const r = await app.db(req, async (db) => {
      await obraVisivel(db, obraId);
      return db.query(
        `insert into cronograma_etapas (empresa_id, obra_id, ordem, nome, inicio, fim, percentual)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [req.usuario!.empresaId, obraId, b.ordem, b.nome, b.inicio, b.fim, b.percentual],
      );
    });
    return reply.status(201).send({ id: r.rows[0].id });
  });

  app.put('/api/obras/:obraId/cronograma/:itemId', { preHandler: exigir(...GESTAO) }, async (req) => {
    const { obraId, itemId } = pObraItem.parse(req.params);
    const b = corpoEtapa.parse(req.body);
    const r = await app.db(req, (db) =>
      db.query(
        `update cronograma_etapas set ordem = $3, nome = $4, inicio = $5, fim = $6, percentual = $7
         where id = $1 and obra_id = $2`,
        [itemId, obraId, b.ordem, b.nome, b.inicio, b.fim, b.percentual],
      ),
    );
    if (!r.rowCount) throw naoEncontrado('Etapa');
    return { id: itemId };
  });

  app.delete('/api/obras/:obraId/cronograma/:itemId', { preHandler: exigir(...GESTAO) }, async (req, reply) => {
    const { obraId, itemId } = pObraItem.parse(req.params);
    const r = await app.db(req, (db) =>
      db.query('delete from cronograma_etapas where id = $1 and obra_id = $2', [itemId, obraId]),
    );
    if (!r.rowCount) throw naoEncontrado('Etapa');
    return reply.status(204).send();
  });
}
