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

## Assistant IA

Tout se règle dans **Paramètres → API → Assistant IA** : deux fournisseurs, **Claude
(Anthropic)** et **GPT (OpenAI)**, chacun avec sa clé, son modèle et son suivi de crédits.

Un **fournisseur par défaut** répond à toutes les tâches, et chaque tâche peut être confiée à
l'autre : script, titres, tags et description des fiches vidéo, rédaction de mails, analyse
(résumés, vérification des dates). Un fournisseur sans clé ne peut pas être choisi ; si la clé
d'un fournisseur choisi disparaît, c'est le défaut qui répond. Un fournisseur que tu n'utilises pas se **désactive** d'un interrupteur : il disparaît des
choix, ses clés sont conservées (et pour OpenAI, les miniatures s'arrêtent avec lui). Les
installations existantes démarrent avec Anthropic et retrouvent leurs réglages.

Saisis les clés à l'écran si `SECRETS_KEY` est configurée côté serveur (16 caractères
minimum). Tu peux aussi déclarer `ANTHROPIC_API_KEY` ou `OPENAI_ASSISTANT_API_KEY` dans
`.env` ou dans la stack Portainer.

**OpenAI : une seule clé pour le texte et les miniatures.** Sans clé propre à l'assistant, la
clé des miniatures (`OPENAI_API_KEY`) est réutilisée, et inversement. Le modèle d'image et la
qualité se règlent dans la même carte. Les appels sont facturés par le compte API OpenAI.

**Voir la dépense réelle d'OpenAI.** OpenAI ne fournit aucun solde par l'API. Avec une clé
**admin** (`OPENAI_ADMIN_KEY`, ou saisie dans la carte OpenAI), le studio lit la dépense de
l'organisation et en déduit ce qu'il reste du solde que tu as noté. Sans elle, il estime à
partir de ce qu'il consomme lui-même.

## Connecter Gmail avec OAuth

Cette option relie Gmail à une instance personnelle sur un NAS. Le retour OAuth se fait
dans l'outil officiel de Google, ce qui permet de garder le Studio sur le réseau local.

1. Dans [Google Cloud](https://console.cloud.google.com/auth/overview), crée ou sélectionne
   ton projet. Configure Google Auth Platform. Pour un projet externe en mode **Test**,
   ajoute l'adresse Gmail concernée parmi les utilisateurs de test.
2. Dans **Clients**, crée un client OAuth de type **Application Web** avec
   `https://developers.google.com/oauthplayground` dans **URI de redirection autorisés**.
3. Dans [OAuth Playground](https://developers.google.com/oauthplayground/), ouvre
   l'engrenage, coche **Use your own OAuth credentials** et renseigne l'identifiant et le
   secret de ce client. Entre `https://mail.google.com/` comme scope, puis clique sur
   **Authorize APIs**. Autorise la boîte que tu veux relier au Studio.
4. Clique sur **Exchange authorization code for tokens** et copie le **Refresh token**.
   Dans **Paramètres → Mails → Gmail (OAuth)**, renseigne l'adresse Gmail, le client OAuth,
   son secret et le jeton de renouvellement. Clique sur **Enregistrer**, puis sur
   **Tester la connexion**. La `SECRETS_KEY` du serveur chiffre le tout en base.

En mode **Test**, Google fait expirer cette autorisation au bout de sept jours. Un
déploiement durable dépend du statut de ton projet et des règles Google applicables au
compte. [Règles de publication](https://support.google.com/cloud/answer/15549945) ·
[Usage personnel](https://support.google.com/cloud/answer/13464323).

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

Pour déployer une branche de test depuis son code sur un serveur Docker, place-toi dans
son checkout, renseigne les variables de déploiement dans `.env`, puis lance :

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

Pour une mise à jour, fais un `git pull --ff-only` sur la branche et relance la même
commande. Si tu reprends une installation existante, sauvegarde SQLite et réutilise le
même projet Compose, le même volume et la même valeur de `SECRETS_KEY`. La variante
`docker-compose.dev.yml` reconstruit les images de l'API et du front depuis le checkout.

## Structure

```
apps/
├── api/    Node 24 + Express 5 + SQLite (node:sqlite), TypeScript exécuté nativement
└── web/    React 19 + Vite 6 + shadcn/ui + Tailwind v4 + Recharts
```

Les deux applications suivent une architecture DDD (`domain` / `application` / `infrastructure` / `presentation`). Les détails techniques, pièges et conventions sont dans [`CLAUDE.md`](./CLAUDE.md).
