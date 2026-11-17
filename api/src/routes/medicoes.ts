import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Cliente } from '../db.js';
import { conflito, HttpErro, naoEncontrado } from '../erros.js';
import { exigir, GESTAO } from '../rbac.js';
import { data, decimal, id, obraVisivel, pObra } from './comum.js';

const pMedicao = z.object({ obraId: id, medicaoId: id });
const LEITURA = exigir('admin', 'escritorio', 'cliente');

/**
 * Itens do orçamento com o que foi medido nesta medição e o acumulado
 * até ela (medições fechadas anteriores + esta).
 */
export async function itensDaMedicao(db: Cliente, obraId: string, medicaoId: string, numero: number) {
  const r = await db.query(
    `select oi.id as "orcamentoItemId", oi.codigo, oi.descricao, oi.unidade,
       oi.quantidade as "quantidadeOrcada", oi.valor_unitario as "valorUnitario",
       coalesce(mi.quantidade, 0) as "quantidadePeriodo",
       round(coalesce(mi.quantidade, 0) * oi.valor_unitario, 2) as "valorPeriodo",
       coalesce((select sum(x.quantidade) from medicao_itens x join medicoes m on m.id = x.medicao_id
                 where x.orcamento_item_id = oi.id and m.numero <= $3), 0) as "quantidadeAcumulada"
     from orcamento_itens oi
     left join medicao_itens mi on mi.orcamento_item_id = oi.id and mi.medicao_id = $2
     where oi.obra_id = $1 order by oi.codigo`,
    [obraId, medicaoId, numero],
  );
  return r.rows.map((i) => ({
    ...i,
    percentualAcumulado: ((Number(i.quantidadeAcumulada) / Number(i.quantidadeOrcada)) * 100).toFixed(2),
  }));
}

async function carregar(db: Cliente, obraId: string, medicaoId: string) {
  const r = await db.query(
    `select id, numero, periodo_inicio as "periodoInicio", periodo_fim as "periodoFim", status,
       pdf_key is not null as "temPdf", fechada_em as "fechadaEm"
     from medicoes where id = $1 and obra_id = $2`,
    [medicaoId, obraId],
  );
  if (!r.rowCount) throw naoEncontrado('Medição');
  return r.rows[0];
}

export async function rotasMedicoes(app: FastifyInstance) {
  app.get('/api/obras/:obraId/medicoes', { preHandler: LEITURA }, async (req) => {
    const { obraId } = pObra.parse(req.params);
    return app.db(req, async (db) => {
      await obraVisivel(db, obraId);
      const r = await db.query(
        `select m.id, m.numero, m.periodo_inicio as "periodoInicio", m.periodo_fim as "periodoFim", m.status,
           coalesce((select round(sum(mi.quantidade * oi.valor_unitario), 2) from medicao_itens mi
                     join orcamento_itens oi on oi.id = mi.orcamento_item_id where mi.medicao_id = m.id), 0) as valor
         from medicoes m where m.obra_id = $1 order by m.numero desc`,
        [obraId],
      );
      return r.rows;
    });
  });

  app.get('/api/obras/:obraId/medicoes/:medicaoId', { preHandler: LEITURA }, async (req) => {
    const { obraId, medicaoId } = pMedicao.parse(req.params);
    return app.db(req, async (db) => {
      const m = await carregar(db, obraId, medicaoId);
      const itens = await itensDaMedicao(db, obraId, medicaoId, m.numero);
      const valorTotal = itens.reduce((s, i) => s + Math.round(Number(i.valorPeriodo) * 100), 0) / 100;
      return { ...m, itens, valorTotal: valorTotal.toFixed(2) };
    });
  });

  // Spec 007 RF01 e RN03
  app.post('/api/obras/:obraId/medicoes', { preHandler: exigir(...GESTAO) }, async (req, reply) => {
    const { obraId } = pObra.parse(req.params);
    const b = z
      .object({ periodoInicio: data, periodoFim: data })
      .strict()
      .refine((p) => p.periodoFim >= p.periodoInicio, { message: 'Fim antes do início', path: ['periodoFim'] })
      .parse(req.body);
    const r = await app.db(req, async (db) => {
      await obraVisivel(db, obraId);
      // Bloqueia a obra para gerar o número em sequência sem corrida
      await db.query('select id from obras where id = $1 for update', [obraId]);
      const rasc = await db.query(`select 1 from medicoes where obra_id = $1 and status = 'rascunho'`, [obraId]);
      if (rasc.rowCount) throw conflito('Já existe uma medição em rascunho nesta obra');
      return db.query(
        `insert into medicoes (empresa_id, obra_id, numero, periodo_inicio, periodo_fim)
         values ($1, $2, (select coalesce(max(numero), 0) + 1 from medicoes where obra_id = $2), $3, $4)
         returning id, numero`,
        [req.usuario!.empresaId, obraId, b.periodoInicio, b.periodoFim],
      );
    });
    return reply.status(201).send(r.rows[0]);
  });

  // Spec 007 RF02: substitui as quantidades da medição em rascunho
  app.put('/api/obras/:obraId/medicoes/:medicaoId/itens', { preHandler: exigir(...GESTAO) }, async (req) => {
    const { obraId, medicaoId } = pMedicao.parse(req.params);
    const itens = z
      .array(
        z
          .object({
            orcamentoItemId: id,
            quantidade: decimal(3).refine((v) => Number(v) >= 0, 'Quantidade não pode ser negativa'),
          })
          .strict(),
      )
      .max(2000)
      .parse(req.body);
    const u = req.usuario!;
    return app.db(req, async (db) => {
      const m = await carregar(db, obraId, medicaoId);
      if (m.status !== 'rascunho') throw conflito('Medição fechada não pode ser alterada');
      for (const i of itens) {
        // O item precisa ser do orçamento desta obra
        const ok = await db.query('select 1 from orcamento_itens where id = $1 and obra_id = $2', [
          i.orcamentoItemId,
          obraId,
        ]);
        if (!ok.rowCount) throw new HttpErro(400, 'Item de orçamento inválido para esta obra');
        if (Number(i.quantidade) === 0) {
          await db.query('delete from medicao_itens where medicao_id = $1 and orcamento_item_id = $2', [
            medicaoId,
            i.orcamentoItemId,
          ]);
        } else {
          await db.query(
            `insert into medicao_itens (empresa_id, obra_id, medicao_id, orcamento_item_id, quantidade)
             values ($1, $2, $3, $4, $5)
             on conflict (medicao_id, orcamento_item_id) do update set quantidade = excluded.quantidade`,
            [u.empresaId, obraId, medicaoId, i.orcamentoItemId, i.quantidade],
          );
        }
      }
      return { id: medicaoId, itens: await itensDaMedicao(db, obraId, medicaoId, m.numero) };
    });
  });

  // Spec 007 RN01, RN02 e RS04: valida o acumulado dentro da transação e fecha
  app.post('/api/obras/:obraId/medicoes/:medicaoId/fechar', { preHandler: exigir(...GESTAO) }, async (req) => {
    const { obraId, medicaoId } = pMedicao.parse(req.params);
    await app.db(req, async (db) => {
      await db.query('select id from medicoes where id = $1 for update', [medicaoId]);
      const m = await carregar(db, obraId, medicaoId);
      if (m.status !== 'rascunho') throw conflito('Medição já fechada');
      const itens = await itensDaMedicao(db, obraId, medicaoId, m.numero);
      if (!itens.some((i) => Number(i.quantidadePeriodo) > 0)) throw conflito('Medição sem itens');
      const excedidos = itens.filter((i) => Number(i.quantidadeAcumulada) > Number(i.quantidadeOrcada));
      if (excedidos.length) {
        throw conflito(`Quantidade acumulada maior que a orçada nos itens: ${excedidos.map((i) => i.codigo).join(', ')}`);
      }
      await db.query(`update medicoes set status = 'fechada', fechada_por = $2, fechada_em = now() where id = $1`, [
        medicaoId,
        req.usuario!.usuarioId,
      ]);
      // Enfileira dentro da transação: se o SQS falhar, o fechamento é desfeito
      await app.servicos.enfileirar({ tipo: 'pdf_medicao', empresaId: req.usuario!.empresaId, medicaoId });
    });
    return { id: medicaoId, status: 'fechada' };
  });

  app.delete('/api/obras/:obraId/medicoes/:medicaoId', { preHandler: exigir(...GESTAO) }, async (req, reply) => {
    const { obraId, medicaoId } = pMedicao.parse(req.params);
    await app.db(req, async (db) => {
      const m = await carregar(db, obraId, medicaoId);
      if (m.status !== 'rascunho') throw conflito('Medição fechada não pode ser excluída');
      await db.query('delete from medicoes where id = $1', [medicaoId]);
    });
    return reply.status(204).send();
  });

  app.get('/api/obras/:obraId/medicoes/:medicaoId/pdf', { preHandler: LEITURA }, async (req) => {
    const { obraId, medicaoId } = pMedicao.parse(req.params);
    const r = await app.db(req, (db) =>
      db.query('select pdf_key, numero from medicoes where id = $1 and obra_id = $2', [medicaoId, obraId]),
    );
    if (!r.rowCount) throw naoEncontrado('Medição');
    if (!r.rows[0].pdf_key) throw new HttpErro(404, 'PDF ainda não gerado');
    return { url: await app.servicos.downloadAssinado(r.rows[0].pdf_key, `medicao-${r.rows[0].numero}.pdf`) };
  });
}
