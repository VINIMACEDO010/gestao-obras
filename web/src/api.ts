import { useCallback, useEffect, useState } from 'react';
import { entrar, obterToken } from './auth';

export class ErroApi extends Error {
  constructor(
    public status: number,
    message: string,
    public detalhes?: { campo: string; mensagem: string }[],
  ) {
    super(message);
  }
}

async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const token = await obterToken();
  const r = await fetch(`/api${caminho}`, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 401) {
    await entrar();
    throw new ErroApi(401, 'Sessão expirada');
  }
  if (r.status === 204) return undefined as T;
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroApi(r.status, dados.erro ?? 'Erro inesperado', dados.detalhes);
  return dados as T;
}

export const api = {
  get: <T>(c: string) => chamar<T>('GET', c),
  post: <T>(c: string, b: unknown = {}) => chamar<T>('POST', c, b),
  put: <T>(c: string, b: unknown) => chamar<T>('PUT', c, b),
  patch: <T>(c: string, b: unknown) => chamar<T>('PATCH', c, b),
  del: (c: string) => chamar<void>('DELETE', c),
};

/** Carrega um recurso e expõe recarregar() */
export function useApi<T>(caminho: string | null) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    if (!caminho) return;
    setCarregando(true);
    try {
      setDados(await api.get<T>(caminho));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [caminho]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { dados, erro, carregando, recarregar };
}

/** Envia a foto direto ao S3 pelo POST pré-assinado (spec 006) */
export async function enviarParaS3(upload: { url: string; campos: Record<string, string> }, arquivo: File) {
  const form = new FormData();
  Object.entries(upload.campos).forEach(([k, v]) => form.append(k, v));
  form.append('file', arquivo); // o arquivo precisa ser o último campo
  const r = await fetch(upload.url, { method: 'POST', body: form });
  if (!r.ok) throw new Error('Falha no envio da foto (tamanho máximo 10 MB)');
}

export const mensagemDeErro = (e: unknown) => {
  if (e instanceof ErroApi && e.detalhes?.length) {
    return `${e.message}: ${e.detalhes.map((d) => `${d.campo} (${d.mensagem})`).join(', ')}`;
  }
  return (e as Error).message;
};
