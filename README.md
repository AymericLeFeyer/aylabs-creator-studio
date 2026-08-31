# Aylabs Creator Studio

Suivi des statistiques de créateur dans le temps : **vues, abonnés, argent gagné**, sur plusieurs chaînes YouTube, avec vue par chaîne et vue cumulée.

- 📈 Séries temporelles par jour, semaine ou mois
- 💰 Revenus **et** dépenses par catégorie (AdSense, affiliation, sponsors, produits, impôts, matériel…), chacune avec sa couleur sur le graphique
- 🎁 Distinction **encaissé** / **avantage en nature** — les produits offerts comptent dans les gains sans jamais être confondus avec du cash
- 🧾 Dépenses saisies à la main, avec bascule **CA ↔ Bénéfices** sur le graphique
- 🎬 **Repères de sortie de vidéo** sur le graphique : un trait en pointillé à chaque publication, avec titre et miniature au survol
- 🔌 Collecte automatique via l'API YouTube, ou saisie manuelle

## Démarrage

Prérequis : **Node 24+** (l'API s'appuie sur `node:sqlite` et l'exécution native de TypeScript).

```bash
git clone https://github.com/AymericLeFeyer/aylabs-creator-studio.git
cd aylabs-creator-studio
npm install
cp .env.example .env      # facultatif : sans clés, tout reste utilisable en manuel
npm run dev
```

- Front : http://localhost:5173
- API : http://localhost:3001

L'application démarre sans aucune clé API : ajoute une chaîne en mode **Manuelle** et saisis tes chiffres. Les clés ne servent qu'à automatiser la collecte.

## Modes de collecte

Chaque chaîne choisit son mode, indépendamment des autres.

| Mode         | Ce qu'il faut                          | Ce que tu obtiens                                            |
| ------------ | -------------------------------------- | ------------------------------------------------------------ |
| **Publique** | `YOUTUBE_API_KEY`                      | Abonnés, vues totales, nombre de vidéos. Aucun revenu. Fonctionne sur n'importe quelle chaîne. |
| **OAuth**    | `GCP_CLIENT_ID`, `GCP_CLIENT_SECRET` + un refresh token par chaîne | Historique **jour par jour** et revenus AdSense. Uniquement pour tes propres chaînes. |
| **Manuelle** | rien                                   | Tout est saisi à la main.                                     |

### Clé API YouTube (mode Publique)

1. [Google Cloud Console](https://console.cloud.google.com) → nouveau projet
2. Activer **YouTube Data API v3**
3. Identifiants → Créer → Clé API → la coller dans `YOUTUBE_API_KEY`

### OAuth (mode OAuth)

Même procédure que [YouTube-Money-Exporter](https://github.com/AymericLeFeyer/YouTube-Money-Exporter) :

1. Activer **YouTube Analytics API** et **YouTube Data API v3**
2. Créer des identifiants OAuth (**application Web**) → `GCP_CLIENT_ID` / `GCP_CLIENT_SECRET`, et ajouter `https://developers.google.com/oauthplayground` aux **URI de redirection autorisés**
3. Sur [OAuth Playground](https://developers.google.com/oauthplayground/), ouvrir l'engrenage ⚙ et cocher **« Use your own OAuth credentials »** puis y coller le même client ID / client secret — sans ça le refresh token appartient au client de Google et l'API répond `unauthorized_client`. Récupérer ensuite un **refresh token** avec les scopes :
   - `https://www.googleapis.com/auth/yt-analytics.readonly`
   - `https://www.googleapis.com/auth/yt-analytics-monetary.readonly` ← indispensable pour les revenus
   - `https://www.googleapis.com/auth/youtube.readonly`
4. Coller le refresh token dans le formulaire de la chaîne (il reste côté serveur, jamais renvoyé au navigateur)

À la première collecte, **deux ans d'historique** sont rattrapés d'un coup : le graphique est utilisable immédiatement, sans attendre. Les **sorties de vidéo** sont enregistrées au même moment, à partir de la playlist d'uploads de la chaîne : elles servent de repères sur le graphique d'argent, avec une case pour les masquer.

## Comment l'argent est calculé

Les catégories sont **communes aux revenus et aux dépenses**. Chacune déclare ce à quoi elle sert :

- **Revenus** : Affiliation, Sponsors, Produits… utilisable seulement à l'entrée.
- **Dépenses** : Impôts, Matériel, Abonnements… utilisable seulement à la sortie.
- **Les deux** : pour ce qui rentre et sort sous le même nom (du matériel revendu, par exemple).

Chaque catégorie de revenu a en plus une **nature** :

- **Encaissé** (`cash`) : l'argent arrive sur ton compte — AdSense, affiliation, sponsors.
- **En nature** (`in_kind`) : produits offerts que tu valorises en euros. Ça compte dans ce que tu as gagné, mais ce n'est pas du cash.

```
Chiffre d'affaires = AdSense + revenus encaissés + (en nature, si la case est cochée)
Bénéfices          = Chiffre d'affaires − dépenses
```

L'interrupteur **CA / Bénéfices** et la case **avantages en nature** sont sur le graphique d'argent, en haut à droite. Les dépenses se saisissent dans l'onglet dédié (montants positifs, la soustraction est faite par le calcul).

> Les revenus AdSense viennent de YouTube Analytics et ne se saisissent pas à la main : la catégorie est verrouillée pour éviter de compter deux fois le même euro.

## Configuration

Toutes les variables sont facultatives. Voir `.env.example`.

| Variable             | Défaut                        | Rôle                                          |
| -------------------- | ----------------------------- | --------------------------------------------- |
| `PORT`               | `3001`                        | Port de l'API                                 |
| `DATABASE_PATH`      | `./data/creator-studio.db`    | Fichier SQLite                                |
| `YOUTUBE_API_KEY`    | —                             | Chaînes publiques                             |
| `GCP_CLIENT_ID`      | —                             | Chaînes OAuth                                 |
| `GCP_CLIENT_SECRET`  | —                             | Chaînes OAuth                                 |
| `COLLECT_CRON`       | `0 * * * *`                   | Fréquence de collecte                         |
| `COLLECT_AT_STARTUP` | `false`                       | Collecter au démarrage                        |
| `BACKFILL_DAYS`      | `730`                         | Profondeur du rattrapage initial              |
| `CORS_ORIGINS`       | `http://localhost:5173`       | Origines autorisées (`*` pour tout)           |

## Déploiement (Docker / Portainer)

Les images sont publiées sur GHCR par GitHub Actions à chaque tag `v*` :

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Sur le VPS, créer une stack Portainer depuis ce dépôt (`docker-compose.yml`) et renseigner les variables. Le front est servi par nginx sur `WEB_PORT` (8080 par défaut) et proxifie `/api` vers le conteneur de l'API — aucun CORS à configurer.

La base vit dans le volume `creator-studio-data` : **ne pas le supprimer entre deux déploiements**, il contient tout l'historique.

Pour construire les images localement :

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Structure

```
apps/
├── api/    Node 24 + Express 5 + SQLite (node:sqlite), TypeScript exécuté nativement
└── web/    React 19 + Vite 6 + shadcn/ui + Tailwind v4 + Recharts
```

Les deux applications suivent une architecture DDD (`domain` / `application` / `infrastructure` / `presentation`). Les détails techniques, pièges et conventions sont dans [`CLAUDE.md`](./CLAUDE.md).
