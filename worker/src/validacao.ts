import { fileTypeFromBuffer } from 'file-type';

export type Resultado = { ok: true } | { ok: false; motivo: string };

const PERMITIDOS = new Set(['image/jpeg', 'image/png']);

/**
 * Spec 006 RS03: confere a assinatura binária (magic bytes) do arquivo enviado.
 * Não confia na extensão nem no Content-Type informado pelo navegador.
 */
export async function validarFoto(
  inicioDoArquivo: Uint8Array,
  tamanhoBytes: number,
  tipoDeclarado: string,
  limiteBytes: number,
): Promise<Resultado> {
  if (tamanhoBytes <= 0) return { ok: false, motivo: 'Arquivo vazio' };
  if (tamanhoBytes > limiteBytes) return { ok: false, motivo: 'Arquivo maior que o limite' };
  const tipo = await fileTypeFromBuffer(inicioDoArquivo);
  if (!tipo || !PERMITIDOS.has(tipo.mime)) return { ok: false, motivo: 'Formato não permitido' };
  if (tipo.mime !== tipoDeclarado) return { ok: false, motivo: 'Conteúdo não corresponde ao tipo declarado' };
  return { ok: true };
}
