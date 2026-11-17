# 006 - Diário de obra com fotos

- **Status:** aprovada

## Contexto

O encarregado registra pelo celular o que aconteceu em cada dia de obra, com fotos. Ao fechar o dia, o sistema gera um PDF que serve como registro formal.

## Requisitos funcionais

- RF01 - Criar um diário por obra e por dia com clima, efetivo (número de pessoas), atividades e ocorrências.
- RF02 - Anexar fotos ao diário pelo celular (JPEG ou PNG, até 10 MB cada).
- RF03 - Fechar o diário. Depois de fechado ele não pode mais ser editado nem receber fotos.
- RF04 - Ao fechar, um worker gera o PDF do diário com as fotos validadas.
- RF05 - Baixar o PDF e ver as fotos por links temporários.

## Regras de negócio

- RN01 - Só um diário por obra por data.
- RN02 - A foto começa como `pendente` e passa a `validada` ou `rejeitada` depois da verificação do worker.

## Requisitos de segurança

| ID | Requisito | ASVS | Como é verificado |
|----|-----------|------|-------------------|
| RS01 | Upload direto ao S3 por POST pré-assinado com tipo de conteúdo fixo e tamanho máximo de 10 MB | V12.1.1 | `routes/diarios.ts` |
| RS02 | O nome do arquivo no S3 é gerado pelo servidor (sem path traversal) | V12.3.1 | `routes/diarios.ts` |
| RS03 | O worker confere a assinatura binária (magic bytes) e apaga arquivos inválidos | V12.2.1 | `worker/src/jobs.ts`, teste `worker/test/worker.test.ts` |
| RS04 | Fotos e PDFs só são entregues por URL pré-assinada de 5 minutos e só se validadas | V12.4 | `routes/diarios.ts` |
| RS05 | Bucket privado, criptografado com KMS, só aceita HTTPS | V8.1, V9.1 | `s3.tf`, Checkov |
| RS06 | Mensagens com falha vão para uma fila de erro (DLQ) depois de 3 tentativas | V7 | `sqs.tf` |

## Critérios de aceite

- [ ] Dado um diário fechado, quando tento editar, então recebo 409.
- [ ] Dado um arquivo `.exe` renomeado para `.jpg`, quando o worker valida, então a foto fica `rejeitada` e o objeto é apagado.
