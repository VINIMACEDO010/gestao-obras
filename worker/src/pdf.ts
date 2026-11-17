import PDFDocument from 'pdfkit';

export interface DadosDiario {
  empresa: string;
  obra: { codigo: string; nome: string; endereco: string | null };
  data: string;
  clima: string;
  efetivo: number;
  atividades: string;
  ocorrencias: string | null;
  autor: string | null;
  fotos: { legenda: string | null; imagem: Buffer }[];
}

export interface DadosMedicao {
  empresa: string;
  obra: { codigo: string; nome: string };
  numero: number;
  periodoInicio: string;
  periodoFim: string;
  fechadaPor: string | null;
  itens: {
    codigo: string;
    descricao: string;
    unidade: string;
    quantidadeOrcada: string;
    quantidadePeriodo: string;
    quantidadeAcumulada: string;
    valorUnitario: string;
    valorPeriodo: string;
  }[];
}

const CLIMA: Record<string, string> = { sol: 'Sol', nublado: 'Nublado', chuva: 'Chuva', chuva_forte: 'Chuva forte' };
// A fonte padrão do PDF não tem sobrescritos (m², m³)
const limpar = (t: string) => t.replace(/²/g, '2').replace(/³/g, '3');
const dataBr = (d: string) => d.split('-').reverse().join('/');
const moeda = (v: number | string) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: string | number) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

function gerar(desenhar: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Producer: 'Gestão de Obras' } });
    const partes: Buffer[] = [];
    doc.on('data', (b: Buffer) => partes.push(b));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
    desenhar(doc);
    doc.end();
  });
}

function cabecalho(doc: PDFKit.PDFDocument, titulo: string, empresa: string, obra: string) {
  doc.fontSize(9).fillColor('#666').text(empresa);
  doc.moveDown(0.3).fontSize(16).fillColor('#000').text(titulo);
  doc.fontSize(11).text(obra);
  doc.moveDown(0.5).moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke().moveDown(0.8);
}

function rodape(doc: PDFKit.PDFDocument) {
  const emitido = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  doc.fontSize(8).fillColor('#666').text(`Documento gerado em ${emitido}`, 50, 790, { align: 'center', width: 495 });
}

export function pdfDiario(d: DadosDiario): Promise<Buffer> {
  return gerar((doc) => {
    cabecalho(doc, `Diário de obra - ${dataBr(d.data)}`, d.empresa, `${d.obra.codigo} - ${d.obra.nome}`);
    if (d.obra.endereco) doc.fontSize(10).text(d.obra.endereco).moveDown(0.5);
    doc.fontSize(10).text(`Clima: ${CLIMA[d.clima] ?? d.clima}    Efetivo: ${d.efetivo} pessoas    Responsável: ${d.autor ?? '-'}`);
    doc.moveDown().fontSize(12).text('Atividades executadas');
    doc.fontSize(10).text(limpar(d.atividades), { align: 'justify' });
    if (d.ocorrencias) {
      doc.moveDown().fontSize(12).text('Ocorrências');
      doc.fontSize(10).text(limpar(d.ocorrencias), { align: 'justify' });
    }
    if (d.fotos.length) {
      doc.moveDown().fontSize(12).text(`Registro fotográfico (${d.fotos.length})`);
      for (const f of d.fotos) {
        if (doc.y > 520) doc.addPage();
        doc.moveDown(0.5);
        try {
          // Calcula o tamanho para avançar o cursor abaixo da imagem
          // openImage existe no pdfkit, mas não está na tipagem
          const img = (doc as unknown as { openImage(b: Buffer): { width: number; height: number } }).openImage(f.imagem);
          const escala = Math.min(495 / img.width, 250 / img.height, 1);
          const largura = img.width * escala;
          const altura = img.height * escala;
          const y = doc.y;
          doc.image(img as unknown as Buffer, 50 + (495 - largura) / 2, y, { width: largura, height: altura });
          doc.y = y + altura + 4;
          doc.x = 50;
        } catch {
          doc.fontSize(9).text('[imagem não pôde ser incluída]');
        }
        if (f.legenda) doc.fontSize(9).fillColor('#444').text(f.legenda, { align: 'center' }).fillColor('#000');
      }
    }
    rodape(doc);
  });
}

export function pdfMedicao(m: DadosMedicao): Promise<Buffer> {
  return gerar((doc) => {
    cabecalho(doc, `Boletim de medição nº ${m.numero}`, m.empresa, `${m.obra.codigo} - ${m.obra.nome}`);
    doc.fontSize(10).text(`Período: ${dataBr(m.periodoInicio)} a ${dataBr(m.periodoFim)}    Fechada por: ${m.fechadaPor ?? '-'}`);
    doc.moveDown();

    const cols = [
      { t: 'Código', w: 45 },
      { t: 'Descrição', w: 150 },
      { t: 'Un', w: 30 },
      { t: 'Orçado', w: 55 },
      { t: 'Período', w: 55 },
      { t: 'Acum. %', w: 45 },
      { t: 'Unitário', w: 55 },
      { t: 'Valor', w: 60 },
    ];
    const linha = (valores: string[], negrito = false) => {
      if (doc.y > 740) doc.addPage();
      const y = doc.y;
      let x = 50;
      doc.font(negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      let altura = 0;
      valores.forEach((v, i) => {
        doc.text(v, x, y, { width: cols[i].w - 4, align: i >= 3 ? 'right' : 'left' });
        altura = Math.max(altura, doc.y - y);
        x += cols[i].w;
      });
      doc.y = y + altura + 4;
      doc.x = 50;
    };
    linha(cols.map((c) => c.t), true);
    let total = 0;
    for (const i of m.itens.filter((x) => Number(x.quantidadePeriodo) > 0)) {
      total += Math.round(Number(i.valorPeriodo) * 100);
      const perc = ((Number(i.quantidadeAcumulada) / Number(i.quantidadeOrcada)) * 100).toFixed(1);
      linha([i.codigo, limpar(i.descricao), limpar(i.unidade), num(i.quantidadeOrcada), num(i.quantidadePeriodo), perc, moeda(i.valorUnitario), moeda(i.valorPeriodo)]);
    }
    doc.moveDown().font('Helvetica-Bold').fontSize(11).text(`Total da medição: ${moeda(total / 100)}`, 50, doc.y, { align: 'right', width: 495 });
    doc.font('Helvetica');
    rodape(doc);
  });
}
