# syntax=docker/dockerfile:1
# Build da API + frontend. O contexto do build é a raiz do repositório.

# Frontend (React/Vite): só os arquivos estáticos vão para a imagem final
FROM node:22-alpine AS web
WORKDIR /repo
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY worker/package.json worker/
COPY web/package.json web/
RUN npm ci --workspace web --include-workspace-root=false
COPY web/ web/
RUN npm run build --workspace web

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
# npm ci exige o package.json de todos os workspaces
COPY api/package.json api/
COPY worker/package.json worker/
COPY web/package.json web/
RUN npm ci --workspace api --include-workspace-root=false
COPY api/ api/
RUN npm run build --workspace api && npm prune --omit=dev --workspace api
# Certificados da AWS para TLS com verificação no RDS
RUN wget -qO /repo/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

FROM node:22-alpine
ENV NODE_ENV=production
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
COPY --from=build --chmod=444 /repo/rds-global-bundle.pem /app/certs/rds-global-bundle.pem
ENV DB_CA_FILE=/app/certs/rds-global-bundle.pem
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/api/package.json ./
COPY --from=build /repo/api/dist ./dist
COPY api/migrations ./migrations
COPY --from=web /repo/web/dist ./public
ENV STATIC_DIR=/app/public
# Usuário sem privilégios; o sistema de arquivos fica somente leitura no ECS
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/server.js"]
