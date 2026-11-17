import { randomUUID } from 'node:crypto';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { Config } from './config.js';

export type Job =
  | { tipo: 'validar_foto'; empresaId: string; fotoId: string }
  | { tipo: 'pdf_diario'; empresaId: string; diarioId: string }
  | { tipo: 'pdf_medicao'; empresaId: string; medicaoId: string };

export interface UploadAssinado {
  url: string;
  campos: Record<string, string>;
}

/** Integrações com S3 e SQS. Interface separada para os testes usarem um dublê. */
export interface Servicos {
  novaChave(prefixo: string, extensao: string): string;
  uploadAssinado(chave: string, contentType: string): Promise<UploadAssinado>;
  downloadAssinado(chave: string, nomeArquivo?: string): Promise<string>;
  enfileirar(job: Job): Promise<void>;
}

const URL_VALIDADE_SEGUNDOS = 300;

export function servicosAws(cfg: Config): Servicos {
  const s3 = new S3Client({ region: cfg.AWS_REGION, forcePathStyle: cfg.S3_FORCE_PATH_STYLE });
  const sqs = new SQSClient({ region: cfg.AWS_REGION });

  return {
    // Spec 006 RS02: a chave é sempre gerada pelo servidor
    novaChave: (prefixo, extensao) => `${prefixo}/${randomUUID()}.${extensao}`,

    async uploadAssinado(chave, contentType) {
      // Spec 006 RS01: tipo de conteúdo fixo e tamanho máximo garantidos pelo próprio S3
      const conditions: NonNullable<Parameters<typeof createPresignedPost>[1]['Conditions']> = [
        ['content-length-range', 1, cfg.UPLOAD_MAX_BYTES],
        ['eq', '$Content-Type', contentType],
      ];
      const fields: Record<string, string> = { 'Content-Type': contentType };
      if (cfg.DOCS_KMS_KEY_ID) {
        fields['x-amz-server-side-encryption'] = 'aws:kms';
        fields['x-amz-server-side-encryption-aws-kms-key-id'] = cfg.DOCS_KMS_KEY_ID;
        conditions.push(['eq', '$x-amz-server-side-encryption', 'aws:kms']);
        conditions.push(['eq', '$x-amz-server-side-encryption-aws-kms-key-id', cfg.DOCS_KMS_KEY_ID]);
      }
      const r = await createPresignedPost(s3, {
        Bucket: cfg.DOCS_BUCKET,
        Key: chave,
        Conditions: conditions,
        Fields: fields,
        Expires: URL_VALIDADE_SEGUNDOS,
      });
      return { url: r.url, campos: r.fields };
    },

    async downloadAssinado(chave, nomeArquivo) {
      return getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: cfg.DOCS_BUCKET,
          Key: chave,
          ResponseContentDisposition: nomeArquivo ? `inline; filename="${nomeArquivo}"` : undefined,
        }),
        { expiresIn: URL_VALIDADE_SEGUNDOS },
      );
    },

    async enfileirar(job) {
      await sqs.send(new SendMessageCommand({ QueueUrl: cfg.JOBS_QUEUE_URL, MessageBody: JSON.stringify(job) }));
    },
  };
}
