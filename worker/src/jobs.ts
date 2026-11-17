import { z } from 'zod';
import type pg from 'pg';
import { naEmpresa } from './db.js';
import { pdfDiario, pdfMedicao } from './pdf.js';
import { validarFoto } from './validacao.js';

export const esquemaJob = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('validar_foto'), empresaId: z.string().uuid(), fotoId: z.string().uuid() }),
  z.object({ tipo: z.literal('pdf_diario'), empresaId: z.string().uuid(), diarioId: z.string().uuid() }),
  z.object({ tipo: z.literal('pdf_medicao'), empresaId: z.string().uuid(), medicaoId: z.string().uuid() }),
]);
export type Job = z.infer<typeof esquemaJob>;

/** Operações de armazenamento usadas pelos jobs (S3 em produção, dublê nos testes). */
export interface Armazenamento {
  tamanho(chave: string): Promise<number | null>;
  lerInicio(chave: string, bytes: number): Promise<Uint8Array>;
  ler(chave: string): Promise<Buffer>;
  gravarPdf(chave: string, conteudo: Buffer): Promise<void>;
  apagar(chave: string): Promise<void>;
}

export interface Deps {
  pool: pg.Pool;
  s3: Armazenamento;
  limiteBytes: number;
  log: (msg: string, extra?: object) => void;
}

const MAX_FOTOS_PDF = 30;

export async function processar(job: Job, d: Deps): Promise<void> {
  switch (job.tipo) {
    case 'validar_foto':
      return validarFotoJob(job.empresaId, job.fotoId, d);
    case 'pdf_diario':
      return pdfDiarioJob(job.empresaId, job.diarioId, d);
    case 'pdf_medicao':
      return pdfMedicaoJob(job.empresaId, job.medicaoId, d);
  }
}

async function validarFotoJob(empresaId: string, fotoId: string, d: Deps) {
  const foto = await naEmpresa(d.pool, empresaId, async (db) => {
    const r = await db.query(`select s3_key, content_type, status from diario_fotos where id = $1`, [fotoId]);
    return r.rows[0];
  });
  if (!foto || foto.status !== 'pendente') return; // idempotente: mensagem repetida é ignorada

  const tamanho = await d.s3.tamanho(foto.s3_key);
  const resultado =
    tamanho === null
      ? ({ ok: false, motivo: 'Arquivo não enviado' } as const)
      : await validarFoto(await d.s3.lerInicio(foto.s3_key, 4100), tamanho, foto.content_type, d.limiteBytes);

  if (!resultado.ok) {
    // Spec 006 RS03: arquivo inválido é apagado
    if (tamanho !== null) await d.s3.apagar(foto.s3_key);
    d.log('foto rejeitada', { fotoId, motivo: resultado.motivo });
  }
  await naEmpresa(d.pool, empresaId, (db) =>
    db.query(`update diario_fotos set status = $2, motivo_rejeicao = $3, tamanho_bytes = $4 where id = $1`, [
      fotoId,
      resultado.ok ? 'validada' : 'rejeitada',
      resultado.ok ? null : resultado.motivo,
      tamanho,
    ]),
  );
}

async function pdfDiarioJob(empresaId: string, diarioId: string, d: Deps) {
  const dados = await naEmpresa(d.pool, empresaId, async (db) => {
    const r = await db.query(
      `select d.*, o.codigo, o.nome as obra_nome, o.endereco, e.nome as empresa, u.nome as autor
       from diarios d join obras o on o.id = d.obra_id join empresas e on e.id = d.empresa_id
       left join usuarios u on u.id = d.autor_id where d.id = $1`,
      [diarioId],
    );
    const fotos = await db.query(
      `select s3_key, legenda from diario_fotos where diario_id = $1 and status = 'validada' order by criado_em limit $2`,
      [diarioId, MAX_FOTOS_PDF],
    );
    return { diario: r.rows[0], fotos: fotos.rows };
  });
  if (!dados.diario) return;
  const dv = dados.diario;
  const fotos = [];
  for (const f of dados.fotos) fotos.push({ legenda: f.legenda, imagem: await d.s3.ler(f.s3_key) });

  const pdf = await pdfDiario({
    empresa: dv.empresa,
    obra: { codigo: dv.codigo, nome: dv.obra_nome, endereco: dv.endereco },
    data: dv.data,
    clima: dv.clima,
    efetivo: dv.efetivo,
    atividades: dv.atividades,
    ocorrencias: dv.ocorrencias,
    autor: dv.autor,
    fotos,
  });
  const chave = `${empresaId}/${dv.obra_id}/diarios/${diarioId}.pdf`;
  await d.s3.gravarPdf(chave, pdf);
  await naEmpresa(d.pool, empresaId, (db) => db.query('update diarios set pdf_key = $2 where id = $1', [diarioId, chave]));
}

async function pdfMedicaoJob(empresaId: string, medicaoId: string, d: Deps) {
  const dados = await naEmpresa(d.pool, empresaId, async (db) => {
    const m = await db.query(
      `select m.*, o.codigo, o.nome as obra_nome, e.nome as empresa, u.nome as fechada_por_nome
       from medicoes m join obras o on o.id = m.obra_id join empresas e on e.id = m.empresa_id
       left join usuarios u on u.id = m.fechada_por where m.id = $1`,
      [medicaoId],
    );
    if (!m.rowCount) return null;
    const itens = await db.query(
      `select oi.codigo, oi.descricao, oi.unidade, oi.quantidade as "quantidadeOrcada",
         oi.valor_unitario as "valorUnitario", mi.quantidade as "quantidadePeriodo",
         round(mi.quantidade * oi.valor_unitario, 2) as "valorPeriodo",
         (select sum(x.quantidade) from medicao_itens x join medicoes mm on mm.id = x.medicao_id
           where x.orcamento_item_id = oi.id and mm.numero <= $2) as "quantidadeAcumulada"
       from medicao_itens mi join orcamento_itens oi on oi.id = mi.orcamento_item_id
       where mi.medicao_id = $1 order by oi.codigo`,
      [medicaoId, m.rows[0].numero],
    );
    return { m: m.rows[0], itens: itens.rows };
  });
  if (!dados) return;
  const { m } = dados;
  const pdf = await pdfMedicao({
    empresa: m.empresa,
    obra: { codigo: m.codigo, nome: m.obra_nome },
    numero: m.numero,
    periodoInicio: m.periodo_inicio,
    periodoFim: m.periodo_fim,
    fechadaPor: m.fechada_por_nome,
    itens: dados.itens,
  });
  const chave = `${empresaId}/${m.obra_id}/medicoes/medicao-${m.numero}.pdf`;
  await d.s3.gravarPdf(chave, pdf);
  await naEmpresa(d.pool, empresaId, (db) => db.query('update medicoes set pdf_key = $2 where id = $1', [medicaoId, chave]));
}
