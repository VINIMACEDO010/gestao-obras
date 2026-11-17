# syntax=docker/dockerfile:1
#checkov:skip=CKV_DOCKER_2:Worker não expõe porta; o ECS reinicia a tarefa se o processo terminar
# Build do worker. O contexto do build é a raiz do repositório.
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
# npm ci exige o package.json de todos os workspaces
COPY api/package.json api/
COPY worker/package.json worker/
COPY web/package.json web/
RUN npm ci --workspace worker --include-workspace-root=false
COPY worker/ worker/
RUN npm run build --workspace worker && npm prune --omit=dev --workspace worker
# Certificados da AWS para TLS com verificação no RDS
RUN wget -qO /repo/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chmod=444 /repo/rds-global-bundle.pem /app/certs/rds-global-bundle.pem
ENV DB_CA_FILE=/app/certs/rds-global-bundle.pem
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/worker/package.json ./
COPY --from=build /repo/worker/dist ./dist

# Usuário sem privilégios; o sistema de arquivos fica somente leitura no ECS
USER node
CMD ["node", "dist/index.js"]
