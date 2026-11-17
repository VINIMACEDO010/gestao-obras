import { z } from 'zod';
import type { Cliente } from '../db.js';
import { naoEncontrado } from '../erros.js';

export const id = z.string().uuid();
export const pObra = z.object({ obraId: id });
export const pObraItem = z.object({ obraId: id, itemId: id });

export const texto = (max = 500) => z.string().trim().min(1).max(max);
export const textoOpcional = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
export const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD');
export const decimal = (casas: number) =>
  z.union([z.number(), z.string()]).transform((v, ctx) => {
    const s = String(v).replace(',', '.');
    const re = new RegExp(`^-?\\d{1,11}(\\.\\d{1,${casas}})?$`);
    if (!re.test(s)) {
      ctx.addIssue({ code: 'custom', message: `Número com até ${casas} casas decimais` });
      return z.NEVER;
    }
    return s;
  });

/** Garante que a obra existe e é visível (RLS) para o usuário. Devolve o registro. */
export async function obraVisivel(db: Cliente, obraId: string) {
  const r = await db.query('select * from obras where id = $1', [obraId]);
  if (!r.rowCount) throw naoEncontrado('Obra');
  return r.rows[0];
}
