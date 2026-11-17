#!/bin/sh
# Cria o bucket e a fila locais quando o LocalStack fica pronto
awslocal s3 mb s3://gestao-obras-docs-local
awslocal s3api put-bucket-cors --bucket gestao-obras-docs-local --cors-configuration \
  '{"CORSRules":[{"AllowedOrigins":["http://localhost:5173"],"AllowedMethods":["GET","POST"],"AllowedHeaders":["*"]}]}'
awslocal sqs create-queue --queue-name gestao-obras-jobs
