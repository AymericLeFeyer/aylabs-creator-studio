# syntax=docker/dockerfile:1

# Node 24 exécute TypeScript nativement (type stripping) : aucune étape de compilation,
# le conteneur lance directement les sources. C'est aussi pour ça que le projet évite
# les syntaxes non effaçables (enums, parameter properties) et utilise `node:sqlite`,
# qui ne demande aucune compilation native.
#
# Debian et non Alpine : les sources Amazon et Domadoo de l'export (Paramètres → API)
# se lisent dans un Firefox sans interface, et Playwright ne fournit ses navigateurs que
# pour la glibc. C'est ce qui fait passer l'image d'environ 200 à 700 Mo.
FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
# Hors de node_modules et du HOME : les navigateurs sont installés en root, puis lus par
# l'utilisateur `node`.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Les manifestes d'abord : la couche d'installation est réutilisée tant qu'ils ne changent pas.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/

RUN npm ci --omit=dev --workspace=@acs/api --include-workspace-root \
 && npm cache clean --force

# `npx playwright` est celui de node_modules : le navigateur installé correspond donc
# exactement à la version de Playwright qui le pilotera. `INSTALL_BROWSERS=false` donne
# une image légère, où seules les sources qui scrapent échouent (avec un message clair).
ARG INSTALL_BROWSERS=true
RUN if [ "$INSTALL_BROWSERS" = "true" ]; then \
      npx playwright install --with-deps firefox && rm -rf /var/lib/apt/lists/*; \
    fi

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
