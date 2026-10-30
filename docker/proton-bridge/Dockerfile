# Proton Mail Bridge pour la stack : l'image communautaire, plus ce qui lui manque.
#
# Pourquoi une image à nous : Bridge se met à jour tout seul, et range la nouvelle version
# dans son volume (~/.local/share/protonmail/bridge-v3/updates). Depuis la 3.2x, ce binaire
# est lié à libfido2, que l'image communautaire n'embarque pas : le conteneur démarre,
# se met à jour, puis ne relance plus jamais (« libfido2.so.1: cannot open shared object
# file »). Laisser la mise à jour se faire est voulu — Proton finit par refuser les vieilles
# versions — il suffit de fournir ses dépendances.
#
# Publiée par la CI (release.yml) sous ghcr.io/<dépôt>-proton-bridge.
ARG BASE=shenxn/protonmail-bridge:latest
FROM ${BASE}

RUN apt-get update \
  && apt-get install -y --no-install-recommends libfido2-1 \
  && rm -rf /var/lib/apt/lists/*
