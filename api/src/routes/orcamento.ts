import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { naoEncontrado } from '../erros.js';
import { exigir, GESTAO } from '../rbac.js';
import { decimal, obraVisivel, pObra, pObraItem, texto } from './comum.js';

const corpoItem = z
  .object({
    codigo: texto(30),
    descricao: texto(300),
    unidade: texto(10),
    quantidade: decimal(3).refine((v) => Number(v) > 0, 'Quantidade deve ser maior que zero'),
    valorUnitario: decimal(2).refine((v) => Number(v) >= 0, 'Valor não pode ser negativo'),
  })
  .strict();

export async function rotasOrcamento(app: FastifyInstance) {
  // Spec 003 RF02 e spec 008: cliente lê o orçamento das obras dele
  app.get('/api/obras/:obraId/orcamento', { preHandler: exigir('admin', 'escritorio', 'cliente') }, async (req) => {
    const { obraId } = pObra.parse(req.params);
    return app.db(req, async (db) => {
      await obraVisivel(db, obraId);
      const r = await db.query(
        `select id, codigo, descricao, unidade, quantidade, valor_unitario as "valorUnitario",
                round(quantidade * valor_unitario, 2) as total
         from orcamento_itens where obra_id = $1 order by codigo`,
        [obraId],
      );
      const totalGeral = r.rows.reduce((s, i) => s + Math.round(Number(i.total) * 100), 0) / 100;
      return { itens: r.rows, totalGeral: totalGeral.toFixed(2) };
    });
  });

  app.post('/api/obras/:obraId/orcamento', { preHandler: exigir(...GESTAO) }, async (req, reply) => {
    const { obraId } = pObra.parse(req.params);
    const b = corpoItem.parse(req.body);
    const r = await app.db(req, async (db) => {
      await obraVisivel(db, obraId);
      return db.query(
        `insert into orcamento_itens (empresa_id, obra_id, codigo, descricao, unidade, quantidade, valor_unitario)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [req.usuario!.empresaId, obraId, b.codigo, b.descricao, b.unidade, b.quantidade, b.valorUnitario],
      );
    });
    return reply.status(201).send({ id: r.rows[0].id });
  });

  app.put('/api/obras/:obraId/orcamento/:itemId', { preHandler: exigir(...GESTAO) }, async (req) => {
    const { obraId, itemId } = pObraItem.parse(req.params);
    const b = corpoItem.parse(req.body);
    const r = await app.db(req, (db) =>
      db.query(
        `update orcamento_itens set codigo = $3, descricao = $4, unidade = $5, quantidade = $6, valor_unitario = $7
         where id = $1 and obra_id = $2`,
        [itemId, obraId, b.codigo, b.descricao, b.unidade, b.quantidade, b.valorUnitario],
      ),
    );
    if (!r.rowCount) throw naoEncontrado('Item');
    return { id: itemId };
  });

  // Spec 003 RN02: a FK de medicao_itens impede excluir item já medido (409)
  app.delete('/api/obras/:obraId/orcamento/:itemId', { preHandler: exigir(...GESTAO) }, async (req, reply) => {
    const { obraId, itemId } = pObraItem.parse(req.params);
    const r = await app.db(req, (db) =>
      db.query('delete from orcamento_itens where id = $1 and obra_id = $2', [itemId, obraId]),
    );
    if (!r.rowCount) throw naoEncontrado('Item');
    return reply.status(204).send();
  });
}
