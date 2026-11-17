import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { carregarConfig } from './config.js';
import { criarPool } from './db.js';
import { esquemaJob, processar, type Armazenamento } from './jobs.js';

const cfg = carregarConfig();
const pool = criarPool(cfg);
const s3 = new S3Client({ region: cfg.AWS_REGION, forcePathStyle: cfg.S3_FORCE_PATH_STYLE });
const sqs = new SQSClient({ region: cfg.AWS_REGION });

const log = (msg: string, extra: object = {}) =>
  console.log(JSON.stringify({ nivel: 'info', msg, ...extra, em: new Date().toISOString() }));

const armazenamento: Armazenamento = {
  async tamanho(chave) {
    try {
      const r = await s3.send(new HeadObjectCommand({ Bucket: cfg.DOCS_BUCKET, Key: chave }));
      return r.ContentLength ?? 0;
    } catch (e) {
      if ((e as { name?: string }).name === 'NotFound') return null;
      throw e;
    }
  },
  async lerInicio(chave, bytes) {
    const r = await s3.send(new GetObjectCommand({ Bucket: cfg.DOCS_BUCKET, Key: chave, Range: `bytes=0-${bytes - 1}` }));
    return r.Body!.transformToByteArray();
  },
  async ler(chave) {
    const r = await s3.send(new GetObjectCommand({ Bucket: cfg.DOCS_BUCKET, Key: chave }));
    return Buffer.from(await r.Body!.transformToByteArray());
  },
  async gravarPdf(chave, conteudo) {
    await s3.send(
      new PutObjectCommand({
        Bucket: cfg.DOCS_BUCKET,
        Key: chave,
        Body: conteudo,
        ContentType: 'application/pdf',
        ServerSideEncryption: cfg.DOCS_KMS_KEY_ID ? 'aws:kms' : undefined,
        SSEKMSKeyId: cfg.DOCS_KMS_KEY_ID,
      }),
    );
  },
  async apagar(chave) {
    await s3.send(new DeleteObjectCommand({ Bucket: cfg.DOCS_BUCKET, Key: chave }));
  },
};

let rodando = true;
process.on('SIGTERM', () => {
  rodando = false;
});

log('worker iniciado');
while (rodando) {
  try {
    const r = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: cfg.JOBS_QUEUE_URL,
        MaxNumberOfMessages: 5,
        WaitTimeSeconds: 20,
        VisibilityTimeout: 120,
      }),
    );
    for (const msg of r.Messages ?? []) {
      try {
        const job = esquemaJob.parse(JSON.parse(msg.Body ?? ''));
        await processar(job, { pool, s3: armazenamento, limiteBytes: cfg.UPLOAD_MAX_BYTES, log });
        await sqs.send(new DeleteMessageCommand({ QueueUrl: cfg.JOBS_QUEUE_URL, ReceiptHandle: msg.ReceiptHandle }));
        log('job concluído', { tipo: job.tipo });
      } catch (e) {
        // Não apaga a mensagem: volta para a fila e, depois de 3 tentativas, vai para a DLQ
        console.error(JSON.stringify({ nivel: 'erro', msg: 'falha no job', erro: String(e), id: msg.MessageId }));
      }
    }
  } catch (e) {
    console.error(JSON.stringify({ nivel: 'erro', msg: 'falha ao ler a fila', erro: String(e) }));
    await new Promise((ok) => setTimeout(ok, 5000));
  }
}
await pool.end();
