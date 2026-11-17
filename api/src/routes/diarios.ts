import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Cliente } from '../db.js';
import { conflito, HttpErro, naoEncontrado } from '../erros.js';
import { EQUIPE, exigir, TODOS } from '../rbac.js';
import { data, id, obraVisivel, pObra, texto, textoOpcional } from './comum.js';

const corpoDiario = z
  .object({
    data,
    clima: z.enum(['sol', 'nublado', 'chuva', 'chuva_forte']),
    efetivo: z.number().int().min(0).max(10000),
    atividades: texto(5000),
    ocorrencias: textoOpcional(5000),
  })
  .strict();

const pDiario = z.object({ obraId: id, diarioId: id });
const pFoto = z.object({ obraId: id, diarioId: id, fotoId: id });

const TIPOS_FOTO: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

async function diarioAberto(db: Cliente, obraId: string, diarioId: string) {
  const r = await db.query('select status from diarios where id = $1 and obra_id = $2 for update', [diarioId, obraId]);
  if (!r.rowCount) throw naoEncontrado('Diário');
  if (r.rows[0].status !== 'aberto') throw conflito('Diário fechado não pode ser alterado');
}

export async function rotasDiarios(app: FastifyInstance) {
  app.get('/api/obras/:obraId/diarios', { preHandler: exigir(...TODOS) }, async (req) => {
    const { obraId } = pObra.parse(req.params);
    return app.db(req, async (db) => {
      await obraVisivel(db, obraId);
      const r = await db.query(
        `select d.id, d.data, d.clima, d.efetivo, d.status, u.nome as autor,
           (select count(*) from diario_fotos f where f.diario_id = d.id and f.status = 'validada')::int as fotos
         from diarios d left join usuarios u on u.id = d.autor_id
         where d.obra_id = $1 order by d.data desc`,
        [obraId],
      );
      return r.rows;
    });
  });

  app.get('/api/obras/:obraId/diarios/:diarioId', { preHandler: exigir(...TODOS) }, async (req) => {
    const { obraId, diarioId } = pDiario.parse(req.params);
    const perfil = req.usuario!.perfil;
    return app.db(req, async (db) => {
      const d = await db.query(
        `select d.id, d.data, d.clima, d.efetivo, d.atividades, d.ocorrencias, d.status,
           d.pdf_key is not null as "temPdf", u.nome as autor
         from diarios d left join usuarios u on u.id = d.autor_id where d.id = $1 and d.obra_id = $2`,
        [diarioId, obraId],
      );
      if (!d.rowCount) throw naoEncontrado('Diário');
      // Cliente só vê fotos validadas
      const f = await db.query(
        `select id, legenda, status, motivo_rejeicao as "motivoRejeicao", criado_em as "criadoEm"
         from diario_fotos where diario_id = $1 and ($2 <> 'cliente' or status = 'validada') order by criado_em`,
        [diarioId, perfil],
      );
      return { ...d.rows[0], fotos: f.rows };
    });
  });

  app.post('/api/obras/:obraId/diarios', { preHandler: exigir(...EQUIPE) }, async (req, reply) => {
    const { obraId } = pObra.parse(req.params);
    const b = corpoDiario.parse(req.body);
    const u = req.usuario!;
    const r = await app.db(req, async (db) => {
      await obraVisivel(db, obraId);
      return db.query(
        `insert into diarios (empresa_id, obra_id, data, clima, efetivo, atividades, ocorrencias, autor_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [u.empresaId, obraId, b.data, b.clima, b.efetivo, b.atividades, b.ocorrencias, u.usuarioId],
      );
    });
    return reply.status(201).send({ id: r.rows[0].id });
  });

  app.put('/api/obras/:obraId/diarios/:diarioId', { preHandler: exigir(...EQUIPE) }, async (req) => {
    const { obraId, diarioId } = pDiario.parse(req.params);
    const b = corpoDiario.parse(req.body);
    return app.db(req, async (db) => {
      await diarioAberto(db, obraId, diarioId);
      await db.query(
        `update diarios set data = $2, clima = $3, efetivo = $4, atividades = $5, ocorrencias = $6 where id = $1`,
        [diarioId, b.data, b.clima, b.efetivo, b.atividades, b.ocorrencias],
      );
      return { id: diarioId };
    });
  });

  // Spec 006 RF03 e RF04
  app.post('/api/obras/:obraId/diarios/:diarioId/fechar', { preHandler: exigir(...EQUIPE) }, async (req) => {
    const { obraId, diarioId } = pDiario.parse(req.params);
    await app.db(req, async (db) => {
      await diarioAberto(db, obraId, diarioId);
      await db.query(`update diarios set status = 'fechado' where id = $1`, [diarioId]);
      // Enfileira dentro da transação: se o SQS falhar, o fechamento é desfeito
      await app.servicos.enfileirar({ tipo: 'pdf_diario', empresaId: req.usuario!.empresaId, diarioId });
    });
    return { id: diarioId, status: 'fechado' };
  });

  app.get('/api/obras/:obraId/diarios/:diarioId/pdf', { preHandler: exigir(...TODOS) }, async (req) => {
    const { obraId, diarioId } = pDiario.parse(req.params);
    const r = await app.db(req, (db) =>
      db.query('select pdf_key, data from diarios where id = $1 and obra_id = $2', [diarioId, obraId]),
    );
    if (!r.rowCount) throw naoEncontrado('Diário');
    if (!r.rows[0].pdf_key) throw new HttpErro(404, 'PDF ainda não gerado');
    return { url: await app.servicos.downloadAssinado(r.rows[0].pdf_key, `diario-${r.rows[0].data}.pdf`) };
  });

  // Spec 006 RS01 e RS02: o servidor cria o registro e devolve um POST pré-assinado
  app.post('/api/obras/:obraId/diarios/:diarioId/fotos', { preHandler: exigir(...EQUIPE) }, async (req, reply) => {
    const { obraId, diarioId } = pDiario.parse(req.params);
    const b = z
      .object({ contentType: z.enum(['image/jpeg', 'image/png']), legenda: textoOpcional(300) })
      .strict()
      .parse(req.body);
    const u = req.usuario!;
    const chave = app.servicos.novaChave(`${u.empresaId}/${obraId}/diarios/${diarioId}`, TIPOS_FOTO[b.contentType]);
    const foto = await app.db(req, async (db) => {
      await diarioAberto(db, obraId, diarioId);
      const r = await db.query(
        `insert into diario_fotos (empresa_id, obra_id, diario_id, s3_key, content_type, legenda, enviado_por)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [u.empresaId, obraId, diarioId, chave, b.contentType, b.legenda, u.usuarioId],
      );
      return r.rows[0];
    });
    const upload = await app.servicos.uploadAssinado(chave, b.contentType);
    return reply.status(201).send({ fotoId: foto.id, upload });
  });

  // Depois do upload o app avisa e o worker valida o arquivo (spec 006 RS03)
  app.post(
    '/api/obras/:obraId/diarios/:diarioId/fotos/:fotoId/confirmar',
    { preHandler: exigir(...EQUIPE) },
    async (req, reply) => {
      const { obraId, diarioId, fotoId } = pFoto.parse(req.params);
      const r = await app.db(req, (db) =>
        db.query(`select status from diario_fotos where id = $1 and diario_id = $2 and obra_id = $3`, [
          fotoId,
          diarioId,
          obraId,
        ]),
      );
      if (!r.rowCount) throw naoEncontrado('Foto');
      if (r.rows[0].status !== 'pendente') throw conflito('Foto já processada');
      await app.servicos.enfileirar({ tipo: 'validar_foto', empresaId: req.usuario!.empresaId, fotoId });
      return reply.status(202).send({ fotoId, status: 'pendente' });
    },
  );

  // Spec 006 RS04: só fotos validadas, por link temporário
  app.get('/api/obras/:obraId/diarios/:diarioId/fotos/:fotoId/url', { preHandler: exigir(...TODOS) }, async (req) => {
    const { obraId, diarioId, fotoId } = pFoto.parse(req.params);
    const r = await app.db(req, (db) =>
      db.query(`select s3_key from diario_fotos where id = $1 and diario_id = $2 and obra_id = $3 and status = 'validada'`, [
        fotoId,
        diarioId,
        obraId,
      ]),
    );
    if (!r.rowCount) throw naoEncontrado('Foto');
    return { url: await app.servicos.downloadAssinado(r.rows[0].s3_key) };
  });

  app.delete(
    '/api/obras/:obraId/diarios/:diarioId/fotos/:fotoId',
    { preHandler: exigir(...EQUIPE) },
    async (req, reply) => {
      const { obraId, diarioId, fotoId } = pFoto.parse(req.params);
      await app.db(req, async (db) => {
        await diarioAberto(db, obraId, diarioId);
        const r = await db.query('delete from diario_fotos where id = $1 and diario_id = $2', [fotoId, diarioId]);
        if (!r.rowCount) throw naoEncontrado('Foto');
      });
      return reply.status(204).send();
    },
  );
}
