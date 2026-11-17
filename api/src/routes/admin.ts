import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { exigir, GESTAO } from '../rbac.js';

export async function rotasAdmin(app: FastifyInstance) {
  // Lista de usuários da empresa (para vincular clientes às obras)
  app.get('/api/usuarios', { preHandler: exigir(...GESTAO) }, async (req) => {
    const { perfil } = z
      .object({ perfil: z.enum(['admin', 'escritorio', 'canteiro', 'cliente']).optional() })
      .parse(req.query);
    return app.db(req, async (db) => {
      const r = await db.query(
        `select id, nome, email, perfil, ativo from usuarios
         where empresa_id = $1 and ($2::text is null or perfil = $2) order by nome`,
        [req.usuario!.empresaId, perfil ?? null],
      );
      return r.rows;
    });
  });

  // Spec 009 RF02
  app.get('/api/auditoria', { preHandler: exigir('admin') }, async (req) => {
    const q = z
      .object({
        tabela: z.string().max(50).optional(),
        limite: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(req.query);
    return app.db(req, async (db) => {
      const r = await db.query(
        `select a.id, a.tabela, a.registro_id as "registroId", a.acao, a.dados_antes as "dadosAntes",
           a.dados_depois as "dadosDepois", a.criado_em as "criadoEm", u.nome as usuario
         from auditoria a left join usuarios u on u.id = a.usuario_id
         where ($1::text is null or a.tabela = $1) order by a.criado_em desc, a.id desc limit $2`,
        [q.tabela ?? null, q.limite],
      );
      return r.rows;
    });
  });
}
