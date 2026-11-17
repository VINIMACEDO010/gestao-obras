import { z } from 'zod';

const booleano = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const esquema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(3000),
    LOG_LEVEL: z.string().default('info'),

    // Autenticação
    AUTH_MODE: z.enum(['cognito', 'dev']).default('cognito'),
    COGNITO_USER_POOL_ID: z.string().optional(),
    COGNITO_CLIENT_ID: z.string().optional(),
    // JWKS do user pool em JSON. Como não há NAT, as chaves são entregues no deploy (spec 001).
    COGNITO_JWKS: z.string().optional(),
    // URL do login gerenciado do Cognito (entregue ao frontend em /api/config)
    COGNITO_DOMAIN: z.string().optional(),

    // Pasta com o build do frontend (servido pela própria API em produção)
    STATIC_DIR: z.string().optional(),

    // Banco
    DB_HOST: z.string().default('localhost'),
    DB_PORT: z.coerce.number().int().default(5432),
    DB_NAME: z.string().default('obras'),
    DB_USER: z.string().default('app_user'),
    DB_PASSWORD: z.string().optional(),
    DB_IAM_AUTH: booleano,
    DB_SSL: booleano,
    DB_CA_FILE: z.string().optional(),
    AWS_REGION: z.string().default('us-east-1'),

    // Armazenamento e fila
    DOCS_BUCKET: z.string().default('gestao-obras-docs-local'),
    DOCS_KMS_KEY_ID: z.string().optional(),
    JOBS_QUEUE_URL: z.string().default(''),
    S3_FORCE_PATH_STYLE: booleano,
    UPLOAD_MAX_BYTES: z.coerce.number().int().default(10 * 1024 * 1024),
  })
  .superRefine((c, ctx) => {
    // RS06 da spec 001: modo dev nunca em produção
    if (c.NODE_ENV === 'production' && c.AUTH_MODE === 'dev') {
      ctx.addIssue({ code: 'custom', message: 'AUTH_MODE=dev não é permitido em produção' });
    }
    if (c.AUTH_MODE === 'cognito' && (!c.COGNITO_USER_POOL_ID || !c.COGNITO_CLIENT_ID)) {
      ctx.addIssue({ code: 'custom', message: 'COGNITO_USER_POOL_ID e COGNITO_CLIENT_ID são obrigatórios' });
    }
    if (!c.DB_IAM_AUTH && !c.DB_PASSWORD) {
      ctx.addIssue({ code: 'custom', message: 'Defina DB_PASSWORD ou DB_IAM_AUTH=true' });
    }
  });

export type Config = z.infer<typeof esquema>;

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = esquema.safeParse(env);
  if (!r.success) {
    const msgs = r.error.issues.map((i) => `${i.path.join('.') || 'config'}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${msgs}`);
  }
  return r.data;
}
