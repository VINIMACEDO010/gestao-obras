import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type pg from 'pg';
import { z } from 'zod';
import type { Config } from './config.js';
import { comContexto } from './db.js';
import { HttpErro, proibido } from './erros.js';
import { perfilDosGrupos, type Perfil } from './rbac.js';

export interface Usuario {
  usuarioId: string;
  sub: string;
  empresaId: string;
  perfil: Perfil;
  nome: string;
  email: string;
}

/** Identidade extraída do token, antes de consultar o banco */
export interface Identidade {
  sub: string;
  email?: string;
  nome?: string;
  perfil?: Perfil;
  empresaId?: string;
}

export type VerificarToken = (token: string) => Promise<Identidade>;

const uuid = z.string().uuid();

/**
 * Valida o ID token do Cognito: assinatura (JWKS), emissor, audiência (client_id),
 * expiração e token_use (spec 001 RS01).
 */
export function verificadorCognito(cfg: Config): VerificarToken {
  const verifier = CognitoJwtVerifier.create({
    userPoolId: cfg.COGNITO_USER_POOL_ID!,
    clientId: cfg.COGNITO_CLIENT_ID!,
    tokenUse: 'id',
  });
  if (cfg.COGNITO_JWKS) {
    // Sem NAT Gateway a API não alcança a URL pública do JWKS, então as chaves chegam pelo deploy
    verifier.cacheJwks(JSON.parse(cfg.COGNITO_JWKS));
  }
  return async (token) => {
    let p: Record<string, unknown>;
    try {
      p = (await verifier.verify(token)) as unknown as Record<string, unknown>;
    } catch {
      throw new HttpErro(401, 'Token inválido');
    }
    const empresa = uuid.safeParse(p['custom:empresa_id']);
    return {
      sub: String(p.sub),
      email: typeof p.email === 'string' ? p.email : undefined,
      nome: typeof p.name === 'string' ? p.name : undefined,
      perfil: perfilDosGrupos(p['cognito:groups']) ?? undefined,
      empresaId: empresa.success ? empresa.data : undefined,
    };
  };
}

/**
 * Modo de desenvolvimento local: "Bearer dev:<sub>". Os dados do usuário vêm da tabela
 * usuarios (criada pelo seed). Bloqueado em produção pelo config.ts.
 */
export function verificadorDev(): VerificarToken {
  return async (token) => {
    if (!token.startsWith('dev:')) throw new HttpErro(401, 'Token inválido');
    return { sub: token.slice(4) };
  };
}

/** Resolve a identidade do token para o usuário do sistema, sincronizando a tabela usuarios. */
export function criarResolvedor(pool: pg.Pool) {
  const cache = new Map<string, { u: Usuario; expira: number }>();

  return async (id: Identidade): Promise<Usuario> => {
    const chave = `${id.sub}|${id.empresaId}|${id.perfil}|${id.email}|${id.nome}`;
    const c = cache.get(chave);
    if (c && c.expira > Date.now()) return c.u;

    const u = await comContexto(
      pool,
      { empresaId: id.empresaId ?? null, usuarioId: null, perfil: id.perfil ?? 'nenhum', sub: id.sub },
      async (db) => {
        if (id.empresaId && id.perfil) {
          // Identidade completa vinda do Cognito: grava ou atualiza o usuário
          const r = await db.query(
            `insert into usuarios (cognito_sub, empresa_id, nome, email, perfil)
             values ($1, $2, $3, $4, $5)
             on conflict (cognito_sub) do update
               set empresa_id = excluded.empresa_id, nome = excluded.nome,
                   email = excluded.email, perfil = excluded.perfil
             returning id, cognito_sub, empresa_id, nome, email, perfil, ativo`,
            [id.sub, id.empresaId, id.nome ?? id.email ?? 'Usuário', id.email ?? '', id.perfil],
          );
          return r.rows[0];
        }
        const r = await db.query(
          `select id, cognito_sub, empresa_id, nome, email, perfil, ativo from usuarios where cognito_sub = $1`,
          [id.sub],
        );
        return r.rows[0];
      },
    );

    // Spec 001 RN01: sem empresa, sem perfil ou desativado não entra
    if (!u || !u.ativo) throw proibido();
    const usuario: Usuario = {
      usuarioId: u.id,
      sub: u.cognito_sub,
      empresaId: u.empresa_id,
      perfil: u.perfil,
      nome: u.nome,
      email: u.email,
    };
    cache.set(chave, { u: usuario, expira: Date.now() + 60_000 });
    return usuario;
  };
}
