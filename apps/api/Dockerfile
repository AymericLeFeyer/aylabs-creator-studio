# syntax=docker/dockerfile:1

# Node 24 exécute TypeScript nativement (type stripping) : aucune étape de compilation,
# le conteneur lance directement les sources. C'est aussi pour ça que le projet évite
# les syntaxes non effaçables (enums, parameter properties) et utilise `node:sqlite`,
# qui ne demande aucune compilation native.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Les manifestes d'abord : la couche d'installation est réutilisée tant qu'ils ne changent pas.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/

RUN npm ci --omit=dev --workspace=@acs/api --include-workspace-root \
 && npm cache clean --force

COPY apps/api/ ./apps/api/

# La base vit dans un volume : sans ça, chaque redéploiement effacerait l'historique.
ENV DATABASE_PATH=/app/data/creator-studio.db
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/apps/api
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
