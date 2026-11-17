import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import type pg from 'pg';
import { ZodError } from 'zod';
import { criarResolvedor, type Usuario, type VerificarToken } from './auth.js';
import type { Config } from './config.js';
import { comContexto, type Cliente } from './db.js';
import { HttpErro } from './erros.js';
import type { Servicos } from './servicos.js';
import { rotasObras } from './routes/obras.js';
import { rotasOrcamento } from './routes/orcamento.js';
import { rotasCronograma } from './routes/cronograma.js';
import { rotasCompras } from './routes/compras.js';
import { rotasDiarios } from './routes/diarios.js';
import { rotasMedicoes } from './routes/medicoes.js';
import { rotasAdmin } from './routes/admin.js';

declare module 'fastify' {
  interface FastifyRequest {
    usuario?: Usuario;
  }
  interface FastifyInstance {
    /** Executa fn numa transação com o contexto RLS do usuário da requisição */
    db<T>(req: FastifyRequest, fn: (c: Cliente) => Promise<T>): Promise<T>;
    servicos: Servicos;
  }
}

export interface Dependencias {
  cfg: Config;
  pool: pg.Pool;
  verificar: VerificarToken;
  servicos: Servicos;
}

export async function criarApp(dep: Dependencias): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      dep.cfg.NODE_ENV === 'test'
        ? false
        : {
            level: dep.cfg.LOG_LEVEL,
            // Spec 001 RS07: token nunca vai para o log
            redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-origin-verify"]'],
          },
    bodyLimit: 256 * 1024,
    trustProxy: true,
  });

  // Cabeçalhos de segurança (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy)
  const docs = [
    `https://${dep.cfg.DOCS_BUCKET}.s3.${dep.cfg.AWS_REGION}.amazonaws.com`,
    `https://${dep.cfg.DOCS_BUCKET}.s3.amazonaws.com`,
  ];
  await app.register(helmet, {
    crossOriginResourcePolicy: { policy: 'same-site' },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', ...docs],
        connectSrc: [
          "'self'",
          `https://cognito-idp.${dep.cfg.AWS_REGION}.amazonaws.com`,
          ...(dep.cfg.COGNITO_DOMAIN ? [dep.cfg.COGNITO_DOMAIN] : []),
          ...docs,
        ],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  const resolver = criarResolvedor(dep.pool);
  app.decorate('servicos', dep.servicos);
  app.decorate('db', function <T>(req: FastifyRequest, fn: (c: Cliente) => Promise<T>) {
    const u = req.usuario!;
    return comContexto(dep.pool, { empresaId: u.empresaId, usuarioId: u.usuarioId, perfil: u.perfil, sub: u.sub }, fn);
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  // Configuração pública de login para o frontend (nada sigiloso: IDs do user pool e do client)
  app.get('/api/config', async () => ({
    authMode: dep.cfg.AUTH_MODE,
    cognitoAuthority: dep.cfg.COGNITO_USER_POOL_ID
      ? `https://cognito-idp.${dep.cfg.AWS_REGION}.amazonaws.com/${dep.cfg.COGNITO_USER_POOL_ID}`
      : null,
    cognitoClientId: dep.cfg.COGNITO_CLIENT_ID ?? null,
    cognitoDomain: dep.cfg.COGNITO_DOMAIN ?? null,
  }));

  const ROTAS_PUBLICAS = new Set(['/api/health', '/api/config']);

  // Autenticação em todas as rotas da API, exceto as públicas
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/') || ROTAS_PUBLICAS.has(req.url.split('?')[0])) return;
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw new HttpErro(401, 'Não autenticado');
    const identidade = await dep.verificar(h.slice(7));
    req.usuario = await resolver(identidade);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpErro) return reply.status(err.status).send({ erro: err.message });
    if (err instanceof ZodError) {
      return reply.status(400).send({
        erro: 'Dados inválidos',
        detalhes: err.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
      });
    }
    const pgErr = err as { code?: string };
    // Erros do PostgreSQL traduzidos sem expor detalhes internos
    if (pgErr.code === '23505') return reply.status(409).send({ erro: 'Registro duplicado' });
    if (pgErr.code === '23503') return reply.status(409).send({ erro: 'Registro em uso ou referência inválida' });
    if (pgErr.code === '23514' || pgErr.code === '22P02' || pgErr.code === '22007' || pgErr.code === '22008') {
      return reply.status(400).send({ erro: 'Dados inválidos' });
    }
    if (pgErr.code === '42501') return reply.status(403).send({ erro: 'Acesso negado' });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.status(status).send({ erro: 'Requisição inválida' });
    req.log.error(err);
    return reply.status(500).send({ erro: 'Erro interno' });
  });

  // Frontend (SPA) servido pela própria API. Arquivos com hash ficam em cache por 1 ano;
  // o index.html nunca fica em cache, para cada deploy chegar na hora.
  const estatico = dep.cfg.STATIC_DIR;
  if (estatico) {
    await app.register(fastifyStatic, {
      root: estatico,
      index: false,
      wildcard: true,
      setHeaders: (res, caminho) => {
        res.header('cache-control', /[\\/]assets[\\/]/.test(caminho) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    app.get('/', (_req, reply) => reply.header('cache-control', 'no-cache').sendFile('index.html'));
  }

  app.setNotFoundHandler((req, reply) => {
    // Rotas do frontend (/obras/123, /callback...) devolvem o index.html
    if (estatico && (req.method === 'GET' || req.method === 'HEAD') && !req.url.startsWith('/api/')) {
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    }
    return reply.status(404).send({ erro: 'Rota não encontrada' });
  });

  await app.register(rotasObras);
  await app.register(rotasOrcamento);
  await app.register(rotasCronograma);
  await app.register(rotasCompras);
  await app.register(rotasDiarios);
  await app.register(rotasMedicoes);
  await app.register(rotasAdmin);

  return app;
}
