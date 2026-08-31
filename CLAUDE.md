# Aylabs Creator Studio

> Dernière mise à jour : 2026-09-01

Suivi des statistiques de créateur dans le temps : vues, abonnés, argent gagné — multi-chaînes, avec vue par chaîne et vue cumulée.

## Stack

| Élément     | Choix                                                                         |
| ----------- | ----------------------------------------------------------------------------- |
| Monorepo    | npm workspaces (`apps/*`)                                                     |
| API         | Node 24 + Express 5 + TypeScript **exécuté nativement** (type stripping)      |
| Base        | SQLite via `node:sqlite` (module natif, aucune dépendance à compiler)         |
| Front       | React 19 + Vite 6 + TypeScript strict                                        |
| Design      | **shadcn/ui + Tailwind v4** — seul design system du projet, ne pas en mêler d'autre |
| Graphiques  | Recharts 3                                                                    |
| Données     | TanStack Query 5                                                              |
| CI/CD       | GitHub Actions → images GHCR → stack Portainer sur VPS                        |

### Commandes

```bash
npm install
npm run dev            # API (3001) + front (5173) en parallèle
npm run dev:api        # API seule
npm run dev:web        # front seul
npm run build          # typecheck API + build front
npm run typecheck
npm run format         # prettier --write (la CI vérifie le format)
```

## Contraintes structurantes (à ne pas casser)

### 1. L'API tourne en TypeScript non compilé

Node 24 efface les types à la volée. Il n'y a **aucune étape de build** côté API, ce qui simplifie le Dockerfile. En contrepartie, `erasableSyntaxOnly: true` est actif et interdit :

- les **parameter properties** (`constructor(private readonly db: X) {}`) → déclarer le champ puis l'assigner ;
- les `enum` → utiliser des unions de littéraux (`type Mode = 'a' | 'b'`) ;
- les `namespace`.

Les imports relatifs portent l'extension `.ts` (obligatoire pour Node).

### 2. Les montants sont des entiers en centimes

`amount_cents` partout en base et dans le domaine. Les flottants fausseraient les cumuls annuels. Le front reçoit des centimes et divise par 100 à l'affichage (`shared/format.ts`). Les endpoints d'écriture acceptent `amount` **en euros** et le convertissent (schéma zod `validation.ts`).

### 3. Flux vs cumuls : deux natures de données qui ne s'agrègent pas pareil

| Table               | Nature | Agrégation                                                        |
| ------------------- | ------ | ----------------------------------------------------------------- |
| `daily_metrics`     | FLUX   | se somment dans le bucket **et** entre chaînes                    |
| `channel_snapshots` | CUMUL  | dernière valeur connue du bucket, puis somme entre chaînes        |

Sommer des `subscribers` de deux jours n'a aucun sens. `GetAnalytics.applyCumulativeTotals()` reporte la dernière valeur connue (forward-fill) pour qu'un jour sans collecte ne fasse pas plonger la courbe à zéro.

### 4. AdSense n'est pas une entrée de revenu

Les revenus AdSense vivent dans `daily_metrics.estimated_revenue_cents`, alimentés par YouTube Analytics. La catégorie `adsense` porte `is_auto = 1` et **refuse toute saisie manuelle** (`SqliteRevenueEntryRepository.assertNotAutoCategory`), sinon le même euro serait compté deux fois. `GetAnalytics.buildCategoryBreakdown()` réinjecte AdSense dans la répartition depuis les métriques, et `buildSeries()` le rattache à la catégorie auto dans `revenueByCategory` pour que le graphique le colore comme les autres.

### 5. Cash vs en nature

`categories.nature` vaut `cash` ou `in_kind`. Elle ne concerne que les revenus : une dépense sort toujours du compte.

- `cash` : l'argent arrive sur le compte (AdSense, affiliation, sponsors).
- `in_kind` : produits offerts valorisés en €. Comptent dans ce qui est « gagné », jamais dans le cash, jamais taxés.

**Le domaine dit `in_kind`, l'interface dit « Produits reçus ».** Le libellé vit à un seul endroit, `NATURE_LABELS` (`apps/web/src/domain/category/entities/Category.ts`) : le renommer là suffit, et rien en base ni dans le contrat d'API ne bouge.

L'API expose les composantes **brutes** (`adsenseCents`, `manualCashCents`, `inKindCents`, `expenseCents`) et ne calcule ni CA ni bénéfice : c'est le consommateur qui compose, pour qu'il n'existe qu'une seule règle. Voir `domain/analytics/services/revenueMath.ts`, dupliqué à l'identique côté API et côté front.

```
CA        = adsense + manualCash + (includeInKind ? inKind : 0)
Bénéfice  = CA - dépenses
```

## Structure DDD

Les deux applications suivent la même découpe.

```
apps/api/src/
├── domain/          channel, metrics, category, revenue, expense, video, analytics
│   └── <domaine>/{entities,repositories,services}    # repositories = interfaces seules
├── application/<domaine>/usecases/
├── infrastructure/
│   ├── db/          database.ts, migrations.ts, filters.ts
│   ├── <domaine>/repositories/                       # implémentations SQLite
│   ├── youtube/api/                                  # clients googleapis
│   └── scheduler/
├── presentation/    server.ts, routes/, middleware/, validation.ts, helpers.ts
└── shared/          dates, money, errors, id

apps/web/src/
├── domain/          types de contrat + calculs purs
├── application/<domaine>/usecases/   # hooks TanStack Query
├── infrastructure/  http/httpClient.ts + <domaine>/api/
├── presentation/    AppLayout, pages/, components/, components/ui/ (shadcn), hooks/
└── shared/          cn, format
```

Les types du front **dupliquent** le contrat de l'API plutôt que de passer par un package partagé (un package imposerait une étape de build aux deux apps et à l'image Docker). **Toute évolution du contrat doit être répercutée des deux côtés.**

## Domaines

### `channel`

`Channel { id, name, platform, mode, externalId, handle, color, refreshToken, isArchived }`

`mode` détermine ce qui est collectable :

| Mode     | Source                            | Données obtenues                                  |
| -------- | --------------------------------- | ------------------------------------------------- |
| `public` | `YOUTUBE_API_KEY` (partagée)      | abonnés, vues totales, nb vidéos. **Aucun revenu** |
| `oauth`  | refresh token **propre à la chaîne** | historique jour par jour + revenus AdSense      |
| `manual` | —                                 | saisie à la main uniquement                       |

`toChannelView()` retire `refreshToken` et le remplace par `hasCredentials: boolean`. **Le token ne sort jamais de l'API.**

`ChannelRepository` : `findAll`, `findById`, `findByExternalId`, `create`, `update`, `delete`.

### `metrics`

- `DailyMetric` (flux) : `views, watchMinutes, averageViewDurationSec, subscribersGained/Lost, likes, comments, shares, estimatedRevenueCents, source`. Clé `(channelId, date)`.
- `ChannelSnapshot` (cumul) : `subscribers, totalViews, totalVideos`. Clé `(channelId, date)`, un seul par jour.

`source` ∈ `youtube_analytics` | `derived` | `manual`. **`manual` fait autorité** : la collecte ne l'écrase jamais.

### `category`

`Category { id, name, nature, scope, color, isAuto, isArchived, sortOrder }` — table `categories`, **commune aux revenus et aux dépenses**.

`scope` dit de quel côté du grand livre la catégorie a le droit d'exister :

| `scope`   | Utilisable en revenu | Utilisable en dépense | Exemple                |
| --------- | -------------------- | --------------------- | ---------------------- |
| `revenue` | oui                  | non                   | Affiliation, Sponsors  |
| `expense` | non                  | oui                   | Impôts, Matériel       |
| `both`    | oui                  | oui                   | du matériel revendu    |

`nature` (`cash` / `in_kind`) ne s'applique qu'aux revenus ; une catégorie de dépense pure la porte à `cash` sans que ça ne serve.

`GET /api/categories?scope=expense` renvoie les catégories `expense` **et** `both` : c'est ce qui permet aux deux formulaires de se servir dans le même référentiel sans proposer « Impôts » en revenu.

Gardes (toutes en 409) :

- un revenu dans une catégorie `expense` → refusé (`SqliteRevenueEntryRepository.assertAcceptsRevenue`) ;
- une dépense dans une catégorie `revenue` → refusé (`SqliteExpenseRepository.assertAcceptsExpense`) ;
- retirer un côté encore utilisé (passer `both` → `revenue` alors que des dépenses y sont rattachées) → refusé (`assertScopeStillFits`) ;
- `nature` et `scope` sont figés sur la catégorie auto (AdSense) ;
- suppression refusée si `isAuto` ou si des revenus **ou** des dépenses y sont rattachés.

Catégories créées au premier démarrage (`SeedDefaultCategories`, identifiants fixes) : `adsense` (revenue, cash, auto), `affiliation`, `sponsors` (revenue, cash), `produits` (revenue, **in_kind**), `impots`, `materiel`, `abonnements` (expense).

### `revenue`

`RevenueEntry { id, channelId, categoryId, videoId, date, amountCents, label, notes }` — `channelId: null` = revenu global, `videoId: null` = non imputé à une sortie. `RevenueEntryView` ajoute `videoTitle`.

### `expense`

`ExpenseEntry { id, channelId, categoryId, videoId, date, amountCents, label, notes }` — table `expense_entries`, ex-`tax_entries`. Montant **toujours positif** : c'est le calcul du bénéfice qui soustrait. Les impôts n'ont plus de statut à part, ils sont une catégorie de dépense parmi d'autres.

### `video`

`Video { id, channelId, externalId, title, publishedAt, date, thumbnailUrl, stats }` — table `videos`, clé unique `(channel_id, external_id)`. `VideoView` y ajoute `channelName` / `channelColor`.

`stats: { views, watchMinutes, subscribersGained, likes, comments, estimatedRevenueCents, updatedAt }` sont des **CUMULS depuis la sortie**, pas des flux : chaque collecte les remplace, ils ne s'additionnent jamais dans le temps et ne se recoupent pas avec `daily_metrics` (une vieille vidéo continue de faire des vues). `updatedAt` vaut `null` tant qu'aucune collecte n'a mesuré la vidéo — c'est ce qui distingue « 0 vue » de « pas encore mesuré », et le front affiche « — » dans ce cas.

La vidéo sert donc à trois choses : **repère temporel** (trait vertical au jour de sortie sur les graphiques d'argent et d'audience), **porte-clé** (les revenus et dépenses s'y rattachent par `video_id`) et **support de mesure** (tableau de performance par vidéo).

`VideoRepository` : `findAll`, `findAllWithChannel`, `findById`, `upsertMany` (titre/miniature, jamais les compteurs), `upsertStats` (compteurs seuls, **UPDATE sans INSERT** : une stat sans ligne de vidéo n'a nulle part où aller), `findLatestDate`, `countByChannel`.

La collecte passe par la **playlist « uploads »** de la chaîne (`infrastructure/youtube/api/uploads.ts`, partagé par les deux clients) et non par `search.list` : 1 unité de quota par page de 50 contre 100 pour une recherche, et l'ordre antéchronologique garanti permet de s'arrêter dès qu'on dépasse la date voulue. Fonctionne en mode `public` (clé API) comme en mode `oauth` (`mine: true`). Les Shorts en font partie, YouTube ne les distingue pas à ce niveau.

`CollectMetrics.collectVideos()` repart de la dernière vidéo connue moins 7 jours ; sans historique, il remonte `BACKFILL_DAYS`. Son échec est **avalé** (`console.warn`) : un repère d'affichage ne doit pas faire échouer une collecte de métriques déjà écrites. Le nombre de vidéos enregistrées revient dans `CollectResult.videosUpserted`.

`CollectMetrics.collectVideoStats()` rafraîchit ensuite les compteurs des vidéos sorties depuis `VIDEO_STATS_WINDOW_DAYS` (365). Son échec est avalé de la même façon, et le compte revient dans `CollectResult.videoStatsUpdated`. Deux sources selon le mode :

| Mode     | Appel                                                        | Ce qu'on obtient                            |
| -------- | ------------------------------------------------------------ | ------------------------------------------- |
| `oauth`  | `reports.query` `dimensions=video`, `filters=video==id1,id2` | vues, minutes, **abonnés gagnés**, likes, commentaires, **AdSense** |
| `public` | `videos.list` `part=statistics` (50 ids max par appel)        | vues, likes, commentaires. **Rien d'autre** |

La fenêtre Analytics part du jour de sortie de la plus ancienne vidéo du lot, pour qu'aucune vue ne soit tronquée. `filters=video==` plafonne à 500 identifiants : les lots font 200.

### `analytics`

`GetAnalytics.execute(query)` renvoie `{ query, series, totals, byCategory, byExpenseCategory, byChannel, videos, videoPerformance, previousTotals }`. `byCategory` = répartition des revenus (AdSense inclus), `byExpenseCategory` = celle des dépenses. `previousTotals` couvre la période précédente de même longueur, pour les variations en %.

`videos` liste les sorties de la période sous forme de `VideoMarker { id, channelId, channelName, channelColor, title, thumbnailUrl, date, bucket }`. **`bucket` est calculé côté API** (`bucketStart`) et tombe exactement sur un `series[].date` : la règle de découpage (semaine ISO commençant le lundi) n'existe qu'à un seul endroit.

`totals` porte aussi deux compteurs de cardinalité, `videosPublished` et `inKindEntries` (nombre de produits reçus, pas leur montant). Ils sont posés par `applyCounts()` après `sumTotals()` : les compter bucket par bucket les ferait doubler dès qu'une entrée tombe à cheval sur un découpage.

`videoPerformance` est une ligne par vidéo sortie dans la période : les compteurs collectés (`views`, `watchHours`, `subscribersGained`, `hasStats`) et l'argent, décomposé en `adsenseCents` / `manualCashCents` / `inKindCents` / `expenseCents` — les mêmes noms que `MoneyParts`, pour que le front y applique `moneyValue` comme à n'importe quel point de série. **L'argent rattaché ignore les bornes de la période** (`sumByVideo` n'a pas de filtre de date) : une sponso encaissée deux mois après la sortie appartient quand même à la vidéo qui l'a rapportée. C'est pour ça que ces montants ne se recoupent pas avec `totals`.

Chaque `TimeSeriesPoint` porte aussi `revenueByCategory` et `expenseByCategory` (`Record<categoryId, cents>`, les zéros omis) : c'est ce qui permet au `MoneyChart` d'empiler une barre par catégorie avec **sa** couleur. Deux dictionnaires séparés, sinon une catégorie `both` mélangerait ce qui rentre et ce qui sort le même jour.

## Endpoints API

Base : `http://localhost:3001`. En prod, nginx proxifie `/api/` vers le conteneur API.

| Méthode  | Route                             | Rôle                                                       |
| -------- | --------------------------------- | ---------------------------------------------------------- |
| `GET`    | `/health`                         | Sonde du conteneur                                         |
| `GET`    | `/api/analytics`                  | Séries + cumuls. Params : `from`, `to`, `granularity` (`day\|week\|month`), `channelIds` (CSV, vide = cumulé), `includeUnassigned` |
| `POST`   | `/api/analytics/collect`          | Collecte immédiate de toutes les chaînes                   |
| `GET`    | `/api/channels`                   | Liste + `latestSnapshot` + `lastMetricDate`. Param `includeArchived` |
| `POST`   | `/api/channels`                   | Créer                                                      |
| `POST`   | `/api/channels/resolve`           | `{ query }` (@handle / URL / UC…) → identifiant + stats     |
| `PATCH`  | `/api/channels/:id`               | Modifier (`refreshToken: ""` efface, absent = conserve)     |
| `DELETE` | `/api/channels/:id`               | Supprimer                                                   |
| `POST`   | `/api/channels/:id/collect`       | Collecter cette chaîne                                      |
| `PUT`    | `/api/channels/:id/metrics`       | Saisie manuelle d'une journée (`source = manual`)           |
| `DELETE` | `/api/channels/:id/metrics/:date` | Supprimer une journée                                       |
| `PUT`    | `/api/channels/:id/snapshots`     | Saisie manuelle d'un total d'abonnés                        |
| `GET`    | `/api/videos`                     | Sorties de vidéo. Params `from`, `to`, `channelIds`, `limit` (200 par défaut). Période **facultative** : le sélecteur de rattachement doit proposer des vidéos plus anciennes que la période affichée |
| `GET`    | `/api/categories`                 | Params `includeArchived`, `scope` (`revenue|expense|both` ; `both` répond toujours) |
| `POST`   | `/api/categories`                 | Créer (`scope` défaut `revenue`)                             |
| `PATCH`  | `/api/categories/:id`             | Modifier / archiver                                         |
| `DELETE` | `/api/categories/:id`             | Refusé si `isAuto` ou si des revenus/dépenses y sont rattachés |
| `GET`    | `/api/revenues`                   | Params `from`, `to`, `channelIds`                            |
| `POST`   | `/api/revenues`                   | `amount` **en euros**, `videoId` facultatif. Refusé sur une catégorie `isAuto` ou `scope: expense` |
| `PATCH`  | `/api/revenues/:id`               | Modifier                                                     |
| `DELETE` | `/api/revenues/:id`               | Supprimer                                                    |
| `GET`    | `/api/expenses`                   | Params `from`, `to`, `channelIds`                            |
| `POST`   | `/api/expenses`                   | `amount` **en euros**, positif, `videoId` facultatif. `categoryId` obligatoire, refusé sur `scope: revenue` |
| `PATCH`  | `/api/expenses/:id`               | Modifier                                                     |
| `DELETE` | `/api/expenses/:id`               | Supprimer                                                    |

Erreurs : `{ error, code, details? }`. `422` pour une validation zod (avec `details[].field`), `409` pour un conflit métier, `502` pour une erreur YouTube.

## Routes front

| Route         | Page              | Contenu                                                    |
| ------------- | ----------------- | ---------------------------------------------------------- |
| `/`           | `DashboardPage`   | 4 cartes de stats, graphique d'argent, audience, répartitions revenus + dépenses, détail par chaîne, performance par vidéo |
| `/revenus`    | `RevenuesPage`    | Liste + saisie des revenus manuels, avec vidéo rattachée    |
| `/depenses`   | `ExpensesPage`    | Liste + saisie des dépenses, avec catégorie et vidéo rattachée |
| `/chaines`    | `ChannelsPage`    | Cartes des chaînes, collecte, saisie manuelle               |
| `/categories` | `CategoriesPage`  | Gestion des catégories : portée (revenus/dépenses/les deux), nature, couleur |

`AppLayout` porte la navigation : Dashboard / Revenus / Dépenses dans la barre, **Chaînes et Catégories dans le menu ⚙ Paramètres** en haut à droite (ce sont des écrans de configuration, pas de lecture). La largeur du site est fixée une fois pour toutes par la constante `CONTAINER` (`max-w-[1800px]`), partagée par l'en-tête et le contenu.

La `FiltersBar` vit **dans l'en-tête collant**, sans trait de séparation : elle en fait partie. Elle n'apparaît pas sur les routes de `ROUTES_WITHOUT_FILTERS` (`/chaines`, `/categories`) — configurer une chaîne ne dépend d'aucune période — et les pages ne la rendent donc plus elles-mêmes. Deux rangées, dans l'ordre où on s'en sert :

1. **quand** : préréglages de période (dont `mtd`, « Ce mois », qui part du 1er du mois en cours), dates personnalisées, pas d'agrégation, et le bouton « Collecter » à l'autre bout de cette même rangée ;
2. **quoi et comment le lire** : puces de chaînes, puis l'interrupteur **CA / Bénéfices** et les coches « Compter les produits reçus » et « Marquer les sorties de vidéo ».

Ces trois réglages pilotent **tous** les graphiques et toutes les cartes : les laisser dans l'un des graphiques obligeait à remonter pour changer d'avis. Le titre du graphique d'argent suit l'interrupteur, il ne le porte plus. `FiltersBar` lit le nombre de sorties via `useAnalytics(useAnalyticsParams())` — même clé de cache que le dashboard, donc requête partagée et non dupliquée.

Deux cartes déplient un panneau au survol (prop `details` de `StatCard`, ouvert aussi au clavier via `focus-within`) : « Vidéos publiées » montre les miniatures des sorties, « Produits reçus » la liste des produits et leur valeur. Le détail des produits ne vient pas d'`analytics`, qui n'expose que des agrégats, mais de `useRevenues` borné **exactement** comme le dashboard — sans quoi le panneau contredirait le total juste au-dessus.

La carte « Abonnés gagnés » met le **gain** en grand et le total en sous-titre : sur une période, ce qui se pilote est la progression, pas un cumul qui ne bouge qu'à la marge.

Disposition du dashboard, de haut en bas : 8 cartes de stats (2 colonnes en mobile, 4 à partir de `lg`), les graphiques d'argent et d'audience **côte à côte** à partir de `2xl`, trois anneaux (revenus / dépenses / revenus par chaîne), puis le classement des vidéos à gauche et le tableau complet à droite.

## Hooks

| Hook                                     | Fichier                                            | Rôle                                        |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------------------- |
| `useFilters` / `FiltersProvider`         | `presentation/hooks/useFilters.tsx`                | Période, chaînes, mode CA/bénéfice, en nature, repères de sortie de vidéo. Persisté en localStorage |
| `useAnalyticsParams`                     | idem                                                | Paramètres prêts pour `useAnalytics`         |
| `useAnalytics`, `useCollectAll`          | `application/analytics/usecases/useAnalytics.ts`   | Requête principale du dashboard              |
| `useChannels`, `useCreateChannel`, `useCollectChannel`, `useSaveManualMetrics`, `useSaveManualSnapshot`, `useResolveChannel` | `application/channel/usecases/useChannels.ts` | CRUD chaînes + collecte |
| `useCategories`, `useCreateCategory`, … | `application/category/usecases/useCategories.ts`  | Catégories (param `{ includeArchived, scope }`) |
| `useVideos`                              | `application/video/usecases/useVideos.ts`         | Sorties de vidéo pour le sélecteur de rattachement (cache 5 min) |
| `useRevenues`, `useCreateRevenue`, …    | `application/revenue/usecases/useRevenues.ts`     | Revenus                                      |
| `useExpenses`, `useCreateExpense`, …    | `application/expense/usecases/useExpenses.ts`     | Dépenses                                     |
| `useTheme`, `useLocalStorage`            | `presentation/hooks/`                              | Thème clair/sombre, stockage protégé          |

Toute mutation d'argent invalide `['analytics', 'revenues', 'expenses']` (`MONEY_ROOTS`, `application/queryKeys.ts`). Une mutation de catégorie invalide en plus `['categories']` : elle change les couleurs et les libellés de tous les graphiques.

## Patterns

- **Client HTTP centralisé** : aucun `fetch` hors de `infrastructure/http/httpClient.ts`.
- **Repositories** : interfaces dans `domain/`, implémentations SQLite dans `infrastructure/`, assemblage dans `container.ts`.
- **Validation** : tous les corps de requête passent par un schéma zod de `presentation/validation.ts`. Les erreurs `ZodError` sont converties en 422 par `errorHandler`.
- **Params de route** : toujours via `param(req, 'id')` (`presentation/helpers.ts`) — Express 5 type `req.params` en `string | string[] | undefined`.
- **Migrations** : tableau ordonné dans `infrastructure/db/migrations.ts`, suivi par `PRAGMA user_version`, appliquées en transaction au démarrage. **Ajouter une migration, ne jamais modifier une existante.** La migration 3 ajoute la table `videos`. La migration 4 ajoute les compteurs par vidéo et les colonnes `video_id` de `revenue_entries` / `expense_entries` — une clé étrangère n'est ajoutable par `ALTER TABLE` que si son défaut vaut `NULL`, ce qui est le cas ici. La migration 2 renomme `revenue_categories` en `categories` (SQLite réécrit les clés étrangères des autres tables toute seule), ajoute `scope`, et transforme `tax_entries` en `expense_entries` en rattachant l'existant à la catégorie `impots`.
- **Couleurs de chaîne** attribuées en rotation à la création (`DEFAULT_COLORS`).

## Points d'attention

- **L'image web n'installe que son propre workspace** (`npm ci --workspace=@acs/web`). Tout ce dont `vite.config.ts` a besoin doit donc être déclaré dans `apps/web/package.json` — dont `@types/node`, sans quoi le `tsc -b` du Dockerfile échoue sur `node:url` et `process` alors que le build local passe (la racine, elle, a les types via l'API).
- **Une seule instance de l'API par fichier SQLite.** Un second process échoue au démarrage sur `database is locked` (`PRAGMA journal_mode = WAL`). Bien arrêter le `npm run dev` précédent.
- **`subscriberCount` public est arrondi** à 3 chiffres significatifs au-delà de 1000. C'est pourquoi le mode `public` ne dérive **que** les vues (exactes) en `daily_metrics`, jamais les abonnés — leurs deltas seraient de faux escaliers. Seul le mode OAuth donne le compte exact.
- **Le refresh token doit être généré sur la bonne chaîne.** `channel==MINE` et `channels.list({ mine: true })` interrogent la chaîne du compte qui a accordé le token. Un token créé sur le compte Google personnel au lieu de la chaîne de marque renvoie une chaîne vide : la collecte réussit et écrit des mois de zéros. Dans l'écran de consentement OAuth, **sélectionner explicitement la chaîne** dans le sélecteur de compte. `CollectMetrics.collectViaOAuth` compare désormais `totals.channelId` à `channel.externalId` et refuse la collecte en cas d'écart, avant toute écriture.
- **`unauthorized_client` = le refresh token n'a pas été émis par ce `GCP_CLIENT_ID`.** Google renvoie cette erreur au moment d'échanger le refresh token contre un access token, donc avant tout appel API. Cause quasi systématique : sur OAuth Playground, la case ⚙ « Use your own OAuth credentials » n'était pas cochée — le token appartient alors au client de Google. Autres causes : client OAuth de type Desktop/TV au lieu d'application Web, ou secret régénéré depuis. À distinguer d'`invalid_grant` (token révoqué, expiré après 7 j en mode « Test », ou mot de passe Google changé), qui se corrige en régénérant le token avec les mêmes identifiants.
- **Une collecte ratée laisse des lignes qui bloquent le backfill.** `resolveStartDate()` repart de `findLastMetricDate() - 4 jours`. Si des lignes vides ont été écrites, le rattrapage sur `BACKFILL_DAYS` ne se redéclenche jamais : il faut supprimer les `daily_metrics` de la chaîne pour forcer un nouveau backfill complet.
- **YouTube révise ses chiffres ~72 h.** `CollectMetrics.REVISION_WINDOW_DAYS = 4` : on re-collecte toujours les derniers jours connus au lieu de repartir du lendemain.
- **Revenus AdSense optionnels.** Si le scope `yt-analytics-monetary.readonly` manque ou que la chaîne n'est pas monétisée, `YouTubeAnalyticsClient.fetchDailyMetrics` retombe sur les métriques sans revenu au lieu de tout perdre. Un `console.warn` le signale.
- **Backfill initial** : à la première collecte d'une chaîne OAuth, `BACKFILL_DAYS` (730 par défaut) sont rattrapés, découpés en fenêtres de 365 jours. Ça peut prendre du temps — d'où `proxy_read_timeout 300s` dans nginx.
- **Suppression d'une chaîne** : `daily_metrics` et `channel_snapshots` partent en cascade, mais les revenus et dépenses sont **détachés** (`channel_id → NULL`), jamais supprimés.
- **Le refresh token est stocké en clair** dans SQLite. Le fichier vit dans un volume Docker sur ton VPS ; ne pas exposer l'API publiquement sans authentification devant.
- **Les repères de vidéo sont dédoublonnés par bucket** : deux sorties le même jour — ou la même semaine en granularité `week` — donnent **un** trait, et l'infobulle du bucket liste les titres avec leur miniature. Sans ça les traits se superposeraient sans qu'on puisse les distinguer.
- **Les vidéos n'arrivent qu'avec une collecte.** Sur une base qui n'a jamais collecté depuis la migration 3, la case « Marquer les sorties de vidéo » n'a aucun effet : c'est `POST /api/channels/:id/collect` (ou le cron horaire) qui remplit la table. Le libellé de la case affiche le nombre de sorties connues sur la période.
- **Recharts n'a pas d'événement de survol sur une `ReferenceLine`** : ce qui s'affiche au survol du trait est en réalité l'infobulle du bucket. Les vidéos sont donc portées par la ligne de données (`ChartRow.videos`), pas par la `ReferenceLine`.
- **Le graphique d'argent lit `byCategory` pour savoir quoi empiler, et `revenueByCategory` pour les valeurs.** Les `dataKey` Recharts sont des clés plates (`r0`, `e1`…) et non les identifiants de catégorie : Recharts résout un `dataKey` texte comme un chemin, un identifiant contenant un point casserait la lecture.
- **La case « Compter les produits reçus » masque, elle ne grise pas.** Décochée, les catégories `in_kind` disparaissent des barres du graphique d'argent, de l'anneau des revenus, de la colonne « Produits reçus » du tableau des vidéos et du détail de son infobulle — parce que ces montants ne sont alors plus dans le CA, et qu'une colonne visible ferait lire une addition qui ne tombe pas juste. `VideoPerformanceTable` retombe sur un tri par date si la colonne triée vient de disparaître.
- **Une catégorie de portée `both` apparaît deux fois dans le graphique**, une barre au-dessus de l'axe et une en dessous, avec la même couleur. C'est voulu : ce sont deux mouvements différents, et les fondre ferait disparaître l'un des deux.
- **Les répartitions sont des anneaux, pas des barres** (`DonutBreakdown`) : le trou porte le total, qui est la valeur lue en premier, et le survol d'une tranche y remplace le total par cette tranche et sa part. La légende est en HTML sous le graphique — sur trois anneaux côte à côte, des étiquettes posées sur les tranches se chevaucheraient.
- **L'anneau « Revenus par chaîne » n'a pas le même total que celui des revenus.** `byChannel` exclut les revenus globaux (`channelId: null`), et l'anneau est en euros pour être comparable à ses deux voisins — pas en vues, qui n'ont pas la même unité.
- **`AudienceChart` n'affiche que des FLUX** (vues, abonnés gagnés, heures vues). La métrique « abonnés cumulés » a été retirée : `subscribersTotal` vaut `null` sur tous les buckets antérieurs au premier relevé de la chaîne, et une série trouée casse le calcul de domaine de Recharts (`domain={['dataMin - 100', …]}` part en `NaN` et l'aire ne se dessine plus). Le total d'abonnés se lit désormais en sous-titre de la carte « Abonnés gagnés ». `TimeSeriesPoint.subscribersTotal` / `viewsTotal` restent produits par l'API (le forward-fill sert aussi de garde-fou) mais **plus aucun écran ne les consomme**. En règle générale : pas de domaine en chaîne de caractères sur une série qui peut contenir des `null`.
- **Les deux graphiques du haut démarrent à la même hauteur** parce que leurs en-têtes font trois lignes chacun : titre, grand chiffre, et une petite ligne. Celle de l'audience (la variation vs période précédente) est rendue même quand la comparaison est impossible — c'est elle qui tient la hauteur.
- **Le graphique d'argent est en euros**, pas en centimes : `MoneyChart` divise par 100 pour Recharts et reformate dans le tooltip.
- **La légende du graphique d'argent est en HTML, pas celle de Recharts.** Cliquer une catégorie la retire de la vue : les séries masquées sont filtrées **avant** d'être passées aux `<Bar>`, elles disparaissent donc aussi de l'infobulle, ce que la prop `hide` de Recharts ne garantit pas. Le masquage est indexé par `r:<categoryId>` / `e:<categoryId>` et non par rang, sinon un changement de période réordonnerait les barres et dépareillerait le masquage. **La ligne « net » et le total du titre suivent les catégories visibles** — masquer « Sponsors » doit les retirer du total lu, sinon la ligne flotterait au-dessus de la pile qui la porte. Sans rien de masqué, la somme retombe exactement sur `moneyValue`.
- **Le survol est synchronisé entre le graphique d'argent et celui d'audience** par un `syncId` commun (`charts/syncId.ts`). Ça ne fonctionne que parce que les deux sont construits sur `data.series`, donc avec la même abscisse et le même nombre de points : Recharts synchronise **par index**. Ne jamais poser ce `syncId` sur un graphique aux points différents — le graphique de performance par vidéo, par exemple, désignerait n'importe quoi.
- **La coche « Marquer les sorties de vidéo » vit dans l'en-tête** (`filters.showVideos`) : elle pilote les deux graphiques d'un coup. Les helpers de repères sont scindés en deux fichiers (`videoMarkers.tsx`, qui n'exporte aucun composant, et `VideoTooltipList.tsx`) pour ne pas déclencher `react-refresh/only-export-components` — la règle ne s'applique qu'aux fichiers qui exportent **à la fois** un composant et autre chose.
- **Le tableau de vidéos est trié par en-tête cliquable** (`VideoPerformanceTable`), premier clic décroissant : sur des vues ou des euros, c'est presque toujours ce qu'on cherche. Ses colonnes suivent l'ordre du calcul : AdSense, Revenus liés, En nature, **CA**, Dépenses liées, **Bénéfices** — la soustraction se lit sur la ligne. Les deux montants composés sont affichés en même temps, indépendamment de l'interrupteur CA/Bénéfices du graphique d'argent ; seule la case « avantages en nature » les fait bouger. Le calcul vit dans `charts/videoPerformance.ts` (`withMoney`, `sumVideoRows`) et délègue la règle à `revenueMath` : les barres et le tableau doivent afficher le même montant pour la même vidéo.
- **Le tableau de performance par vidéo ne se compare pas aux totaux de la période.** Ses compteurs sont des cumuls depuis la sortie de chaque vidéo, et son argent rattaché n'a pas de borne de date ; les totaux du dashboard, eux, comptent ce qui s'est passé pendant la période, vieilles vidéos comprises. Les deux chiffres sont justes et différents.
- **Onglets plutôt que double axe** dans le graphique par vidéo : vues, abonnés et euros n'ont pas la même échelle, et un second axe y ferait lire des corrélations inventées.
- **Rattacher une vidéo force la chaîne** du revenu ou de la dépense (une vidéo appartient à une seule chaîne), et changer de chaîne détache la vidéo. `VideoSelect` garde en tête de liste la vidéo déjà rattachée même si elle sort du filtre courant, sinon une édition l'effacerait silencieusement.

## Déploiement

Images publiées sur GHCR par `.github/workflows/release.yml` :
`ghcr.io/aymericlefeyer/aylabs-creator-studio-api` et `-web`.

| Déclencheur              | Tags d'image produits                     |
| ------------------------ | ----------------------------------------- |
| push sur `main`          | `latest` + `main-sha-<court>`             |
| tag `v1.2.3`             | `1.2.3`, `1.2`, `latest`                  |
| déclenchement manuel     | le tag saisi (`latest` par défaut)        |

`release.yml` appelle `ci.yml` (`workflow_call`) en job `check` avant de builder : **aucune image n'est publiée si le typage, le lint, le format ou le build échouent**. C'est pour ça que `ci.yml` ne se déclenche plus sur `push: main` — sinon les vérifications tourneraient deux fois pour un même commit. Un `concurrency` annule la build précédente encore en cours sur la même ref, pour que deux pushes rapprochés ne se disputent pas le tag `latest`.

Sur le VPS, stack Portainer à partir de `docker-compose.yml`. Variables : `YOUTUBE_API_KEY`, `GCP_CLIENT_ID`, `GCP_CLIENT_SECRET`, `WEB_PORT`, `TAG`. Le volume `creator-studio-data` porte la base — **ne pas le supprimer entre deux déploiements**.

Build local des images : `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`.
