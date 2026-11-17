import { describe, expect, it } from 'vitest';
import { esquemaJob } from '../src/jobs.js';
import { pdfDiario, pdfMedicao } from '../src/pdf.js';
import { validarFoto } from '../src/validacao.js';

const LIMITE = 10 * 1024 * 1024;
// Assinaturas mínimas reconhecidas pelo file-type
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, ...new Array(20).fill(0)]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, ...new Array(20).fill(0)]);
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x03, ...new Array(60).fill(0)]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

// PNG 1x1 válido para o PDF
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('validação de fotos (spec 006 RS03)', () => {
  it('aceita JPEG e PNG verdadeiros', async () => {
    expect(await validarFoto(JPEG, 1000, 'image/jpeg', LIMITE)).toEqual({ ok: true });
    expect(await validarFoto(PNG, 1000, 'image/png', LIMITE)).toEqual({ ok: true });
  });

  it('rejeita executável renomeado para .jpg', async () => {
    expect(await validarFoto(EXE, 1000, 'image/jpeg', LIMITE)).toMatchObject({ ok: false });
  });

  it('rejeita SVG (pode conter script)', async () => {
    expect(await validarFoto(SVG, 1000, 'image/jpeg', LIMITE)).toMatchObject({ ok: false });
  });

  it('rejeita PNG enviado como JPEG', async () => {
    expect(await validarFoto(PNG, 1000, 'image/jpeg', LIMITE)).toMatchObject({
      ok: false,
      motivo: 'Conteúdo não corresponde ao tipo declarado',
    });
  });

  it('rejeita arquivo acima do limite e vazio', async () => {
    expect(await validarFoto(JPEG, LIMITE + 1, 'image/jpeg', LIMITE)).toMatchObject({ ok: false });
    expect(await validarFoto(JPEG, 0, 'image/jpeg', LIMITE)).toMatchObject({ ok: false });
  });
});

describe('mensagens da fila', () => {
  it('recusa mensagem com campos inválidos', () => {
    expect(() => esquemaJob.parse({ tipo: 'validar_foto', empresaId: 'x', fotoId: 'y' })).toThrow();
    expect(() => esquemaJob.parse({ tipo: 'apagar_tudo' })).toThrow();
  });
});

describe('geração de PDF', () => {
  it('gera o diário com foto', async () => {
    const pdf = await pdfDiario({
      empresa: 'Construtora Teste',
      obra: { codigo: 'OB-1', nome: 'Obra Teste', endereco: 'Rua A, 1' },
      data: '2026-11-10',
      clima: 'sol',
      efetivo: 10,
      atividades: 'Concretagem da laje com acentuação: ção, ã, é.',
      ocorrencias: 'Atraso na entrega do aço',
      autor: 'Carlos',
      fotos: [{ legenda: 'Laje', imagem: PNG_1X1 }],
    });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('gera o boletim de medição', async () => {
    const pdf = await pdfMedicao({
      empresa: 'Construtora Teste',
      obra: { codigo: 'OB-1', nome: 'Obra Teste' },
      numero: 1,
      periodoInicio: '2026-09-01',
      periodoFim: '2026-09-30',
      fechadaPor: 'Bruno',
      itens: [
        {
          codigo: '01.01',
          descricao: 'Escavação',
          unidade: 'm³',
          quantidadeOrcada: '120',
          quantidadePeriodo: '80',
          quantidadeAcumulada: '80',
          valorUnitario: '45.00',
          valorPeriodo: '3600.00',
        },
      ],
    });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
