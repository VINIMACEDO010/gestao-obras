import { z } from 'zod';

const booleano = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

export const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  AWS_REGION: z.string().default('us-east-1'),
  JOBS_QUEUE_URL: z.string().min(1),
  DOCS_BUCKET: z.string().min(1),
  DOCS_KMS_KEY_ID: z.string().optional(),
  S3_FORCE_PATH_STYLE: booleano,
  UPLOAD_MAX_BYTES: z.coerce.number().int().default(10 * 1024 * 1024),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().default(5432),
  DB_NAME: z.string().default('obras'),
  DB_USER: z.string().default('app_user'),
  DB_PASSWORD: z.string().optional(),
  DB_IAM_AUTH: booleano,
  DB_SSL: booleano,
  DB_CA_FILE: z.string().optional(),
});

export type Config = z.infer<typeof esquema>;
export const carregarConfig = (env = process.env): Config => esquema.parse(env);
