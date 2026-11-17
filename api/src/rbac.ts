import type { FastifyRequest } from 'fastify';
import { HttpErro, proibido } from './erros.js';

export const PERFIS = ['admin', 'escritorio', 'canteiro', 'cliente'] as const;
export type Perfil = (typeof PERFIS)[number];

/** Spec 001 RN02: com mais de um grupo vale o de maior privilégio. */
export function perfilDosGrupos(grupos: unknown): Perfil | null {
  if (!Array.isArray(grupos)) return null;
  for (const p of PERFIS) if (grupos.includes(p)) return p;
  return null;
}

/** Gestão (escritório) e administração */
export const GESTAO: Perfil[] = ['admin', 'escritorio'];
export const EQUIPE: Perfil[] = ['admin', 'escritorio', 'canteiro'];
export const TODOS: Perfil[] = [...PERFIS];

/** preHandler que só deixa passar os perfis informados (matriz em specs/README.md). */
export function exigir(...perfis: Perfil[]) {
  return async (req: FastifyRequest) => {
    if (!req.usuario) throw new HttpErro(401, 'Não autenticado');
    if (!perfis.includes(req.usuario.perfil)) throw proibido();
  };
}
