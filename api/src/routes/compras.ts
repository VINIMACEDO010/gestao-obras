import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { conflito, naoEncontrado } from '../erros.js';
import { EQUIPE, exigir, GESTAO } from '../rbac.js';
import { data, decimal, obraVisivel, pObra, pObraItem, texto, textoOpcional } from './comum.js';

const corpoCompra = z
  .object({
    descricao: texto(300),
    quantidade: decimal(3).refine((v) => Number(v) > 0, 'Quantidade deve ser maior que zero'),
    unidade: texto(10),
    fornecedor: textoOpcional(200),
    valorEstimado: decimal(2)
      .refine((v) => Number(v) >= 0, 'Valor não pode ser negativo')
      .nullish(),
    dataNecessidade: data.nullish(),
  })
  .strict();

/** Spec 005 RF02: transições permitidas */
export const TRANSICOES: Record<string, string[]> = {
  solicitada: ['aprovada', 'cancelada'],
  aprovada: ['recebida', 'cancelada'],
  recebida: [],
  cancelada: [],
};

const SELECT = `select c.id, c.descricao, c.quantidade, c.unidade, c.fornecedor, c.valor_estimado as "valorEstimado",
  c.data_necessidade as "dataNecessidade", c.status, c.criado_em as "criadoEm",
  s.nome as "solicitadoPor", a.nome as "aprovadoPor"
  from compras c left join usuarios s on s.id = c.solicitado_por left join usuarios a on a.id = c.aprovado_por`;

export async function rotasCompras(app: FastifyInstance) {
  app.get('/api/obras/:obraId/compras', { preHandler: exigir(...EQUIPE) }, async (req) => {
    const { obraId } = pObra.parse(req.params);
    return app.db(req, async (db) => {
      await obraVisivel(db, obraId);
      return (await db.query(`${SELECT} where c.obra_id = $1 order by c.criado_em desc`, [obraId])).rows;
    });
  });

  // Canteiro também solicita (spec 005 RS01)
  app.post('/api/obras/:obraId/compras', { preHandler: exigir(...EQUIPE) }, async (req, reply) => {
    const { obraId } = pObra.parse(req.params);
    const b = corpoCompra.parse(req.body);
    const u = req.usuario!;
    const r = await app.db(req, async (db) => {
      await obraVisivel(db, obraId);
      return db.query(
        `insert into compras (empresa_id, obra_id, descricao, quantidade, unidade, fornecedor, valor_estimado,
           data_necessidade, solicitado_por)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
        [u.empresaId, obraId, b.descricao, b.quantidade, b.unidade, b.fornecedor, b.valorEstimado ?? null,
          b.dataNecessidade ?? null, u.usuarioId],
      );
    });
    return reply.status(201).send({ id: r.rows[0].id });
  });

  // Só gestão muda o status. O aprovador vem do token (spec 005 RS03)
  app.patch('/api/obras/:obraId/compras/:itemId/status', { preHandler: exigir(...GESTAO) }, async (req) => {
    const { obraId, itemId } = pObraItem.parse(req.params);
    const { status } = z
      .object({ status: z.enum(['aprovada', 'recebida', 'cancelada']) })
      .strict()
      .parse(req.body);
    return app.db(req, async (db) => {
      const atual = await db.query('select status from compras where id = $1 and obra_id = $2 for update', [
        itemId,
        obraId,
      ]);
      if (!atual.rowCount) throw naoEncontrado('Compra');
      if (!TRANSICOES[atual.rows[0].status].includes(status)) {
        throw conflito(`Não é possível mudar de ${atual.rows[0].status} para ${status}`);
      }
      await db.query(
        `update compras set status = $2, aprovado_por = case when $2 = 'aprovada' then $3::uuid else aprovado_por end
         where id = $1`,
        [itemId, status, req.usuario!.usuarioId],
      );
      return { id: itemId, status };
    });
  });

  app.delete('/api/obras/:obraId/compras/:itemId', { preHandler: exigir(...GESTAO) }, async (req, reply) => {
    const { obraId, itemId } = pObraItem.parse(req.params);
    await app.db(req, async (db) => {
      const r = await db.query('select status from compras where id = $1 and obra_id = $2', [itemId, obraId]);
      if (!r.rowCount) throw naoEncontrado('Compra');
      if (r.rows[0].status !== 'solicitada') throw conflito('Só compras solicitadas podem ser excluídas');
      await db.query('delete from compras where id = $1', [itemId]);
    });
    return reply.status(204).send();
  });
}
