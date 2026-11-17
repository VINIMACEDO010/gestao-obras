export class HttpErro extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const FEMININOS = new Set(['Obra', 'Medição', 'Foto', 'Etapa', 'Compra']);
export const naoEncontrado = (o = 'Registro') =>
  new HttpErro(404, `${o} não ${FEMININOS.has(o) ? 'encontrada' : 'encontrado'}`);
export const proibido = () => new HttpErro(403, 'Acesso negado');
export const conflito = (m: string) => new HttpErro(409, m);
