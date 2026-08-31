# syntax=docker/dockerfile:1

# --- Étape 1 : build du bundle statique ---
FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
RUN npm ci --workspace=@acs/web --include-workspace-root

COPY apps/web/ ./apps/web/

# VITE_API_URL reste vide : le front appelle /api en relatif et nginx proxifie.
# Une URL codée en dur ici figerait le nom d'hôte de l'API dans le bundle.
RUN npm run build --workspace=@acs/web

# --- Étape 2 : service des fichiers + proxy vers l'API ---
FROM nginx:alpine

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template

# Résolu au démarrage par l'entrypoint nginx : permet de changer la cible sans rebuild.
ENV API_UPSTREAM=http://api:3001

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
