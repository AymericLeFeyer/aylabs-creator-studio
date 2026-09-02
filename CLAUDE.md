# Aylabs Creator Studio

> Dernière mise à jour : 2026-09-02

Suivi des statistiques de créateur dans le temps : vues, abonnés, argent gagné — multi-chaînes, avec vue par chaîne et vue cumulée. **Et le pilotage de la production** : calendrier des vidéos, scripts, créneaux de travail, produits reçus et sponsos, dont l'argent rejoint la comptabilité sans ressaisie.

## Stack

| Élément    | Choix                                                                               |
| ---------- | ----------------------------------------------------------------------------------- |
| Monorepo   | npm workspaces (`apps/*`)                                                           |
| API        | Node 24 + Express 5 + TypeScript **exécuté nativement** (type stripping)            |
| Base       | SQLite via `node:sqlite` (module natif, aucune dépendance à compiler)               |
| Front      | React 19 + Vite 6 + TypeScript strict                                               |
| Design     | **shadcn/ui + Tailwind v4** — seul design system du projet, ne pas en mêler d'autre |
| Graphiques | Recharts 3                                                                          |
| Markdown   | `react-markdown` + `remark-gfm` (éditeur de script uniquement, chunk isolé)         |
| Données    | TanStack Query 5                                                                    |
| CI/CD      | GitHub Actions → images GHCR → stack Portainer sur VPS                              |

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

| Table               | Nature | Agrégation                                                 |
| ------------------- | ------ | ---------------------------------------------------------- |
| `daily_metrics`     | FLUX   | se somment dans le bucket **et** entre chaînes             |
| `channel_snapshots` | CUMUL  | dernière valeur connue du bucket, puis somme entre chaînes |

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

### 6. Un revenu généré n'a qu'un seul point d'écriture

Un produit passé à `received` et une sponso passée à `paid` **créent** l'entrée de revenu
correspondante (`produits` en nature, `sponsors` en cash) et la gardent liée par
`revenue_entry_id`. `revenue_entries.origin` (`manual` | `product` | `sponsorship`)
porte la trace, et `SqliteRevenueEntryRepository.update/delete` refuse en **409** toute
entrée non `manual` : deux points d'écriture sur la même ligne la feraient diverger en
silence — le montant corrigé côté Revenus ne remonterait jamais dans la fiche produit.

Les use cases `ManageProducts` / `ManageSponsorships` sont les seuls à passer par
`updateLinked` / `deleteLinked`, qui contournent la garde. **Les routes ne parlent jamais
directement aux dépôts `products` / `sponsorships` / `productions`** : un chemin
d'écriture qui les court-circuiterait oublierait la synchronisation.

La règle tient en une phrase par côté, et chaque écriture y ramène l'entrée quel que soit
le chemin emprunté : _un produit `received` valorisé a une entrée de revenu, tous les
autres n'en ont pas_ ; _une sponso `paid` a une entrée de revenu cash, toutes les autres
n'en ont pas._

## Structure DDD

Les deux applications suivent la même découpe.

```
apps/api/src/
├── domain/          channel, metrics, category, revenue, expense, video, analytics,
│                    brand, production, product, sponsorship, idea, legal
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

| Mode     | Source                               | Données obtenues                                   |
| -------- | ------------------------------------ | -------------------------------------------------- |
| `public` | `YOUTUBE_API_KEY` (partagée)         | abonnés, vues totales, nb vidéos. **Aucun revenu** |
| `oauth`  | refresh token **propre à la chaîne** | historique jour par jour + revenus AdSense         |
| `manual` | —                                    | saisie à la main uniquement                        |

`toChannelView()` retire `refreshToken` et le remplace par `hasCredentials: boolean`. **Le token ne sort jamais de l'API.**

`ChannelRepository` : `findAll`, `findById`, `findByExternalId`, `create`, `update`, `delete`.

### `metrics`

- `DailyMetric` (flux) : `views, watchMinutes, averageViewDurationSec, subscribersGained/Lost, likes, comments, shares, estimatedRevenueCents, source`. Clé `(channelId, date)`.
- `ChannelSnapshot` (cumul) : `subscribers, totalViews, totalVideos`. Clé `(channelId, date)`, un seul par jour.

`source` ∈ `youtube_analytics` | `derived` | `manual`. **`manual` fait autorité** : la collecte ne l'écrase jamais.

### `category`

`Category { id, name, nature, scope, color, isAuto, isArchived, sortOrder }` — table `categories`, **commune aux revenus et aux dépenses**.

`scope` dit de quel côté du grand livre la catégorie a le droit d'exister :

| `scope`   | Utilisable en revenu | Utilisable en dépense | Exemple               |
| --------- | -------------------- | --------------------- | --------------------- |
| `revenue` | oui                  | non                   | Affiliation, Sponsors |
| `expense` | non                  | oui                   | Impôts, Matériel      |
| `both`    | oui                  | oui                   | du matériel revendu   |

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

| Mode     | Appel                                                        | Ce qu'on obtient                                                    |
| -------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `oauth`  | `reports.query` `dimensions=video`, `filters=video==id1,id2` | vues, minutes, **abonnés gagnés**, likes, commentaires, **AdSense** |
| `public` | `videos.list` `part=statistics` (50 ids max par appel)       | vues, likes, commentaires. **Rien d'autre**                         |

La fenêtre Analytics part du jour de sortie de la plus ancienne vidéo du lot, pour qu'aucune vue ne soit tronquée. `filters=video==` plafonne à 500 identifiants : les lots font 200.

### `brand`

`Brand { id, name, website, contactName, contactEmail, color, notes, isArchived }` — table `brands`.

Référentiel **commun aux produits et aux sponsos** : sans identifiant partagé, « la marque qui me donne le plus » ne serait pas calculable (trois orthographes du même nom feraient trois lignes de classement). Suppression refusée en 409 dès qu'un produit ou une sponso s'y rattache — l'archivage est là pour ça.

`color` est attribuée **en rotation** à la création quand elle n'est pas fournie (`DEFAULT_COLORS`, même mécanique que les chaînes) : une couleur par défaut unique rendrait les classements du dashboard illisibles, six barres grises ne se distinguant pas.

`stats(range, channelIds)` renvoie une `BrandStats` par marque : produits **reçus** sur la période (comptés à `received_at`), sponsos **encaissées** (comptées à `paid_at`), et `sponsorshipsPendingCents` — de l'argent promis, donc **hors période**, sinon une sponso signée sans échéance disparaîtrait du « à encaisser ». Les lignes sans marque sont regroupées sous `__none__` / « Sans marque » : les ignorer donnerait un classement dont la somme ne retombe pas sur les totaux. Trois lectures agrégées et non une jointure triple : les tables et les colonnes de date diffèrent, et une seule requête produirait un produit cartésien entre produits et sponsos.

### `production`

`Production { id, channelId, videoId, title, status, pausedReason, pausedAt, startDate, plannedDate, script, notes, sortOrder }` — table `productions`.

C'est **la vidéo avant sa publication**. Le jour de la sortie, elle se rattache à la ligne `videos` collectée sur YouTube (`video_id`, index unique partiel : une sortie n'appartient qu'à une production). Rien n'est supprimé à ce moment-là : elle quitte la file d'attente pour les terminées, script et créneaux intacts.

| `status`      | Sens                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `idea`        | notée, pas commencée                                                                                                              |
| `in_progress` | le travail est lancé                                                                                                              |
| `paused`      | bloquée par **quelqu'un d'autre** (retour de marque, produit qui n'arrive pas) — `pausedReason` dit quoi, `pausedAt` depuis quand |
| `done`        | publiée                                                                                                                           |

`paused_at` est posé par le **passage** en pause, pas par la mise à jour de la raison : corriger le libellé d'un blocage ne doit pas remettre le compteur « en pause depuis X jours » à zéro.

`sortOrder` porte l'ordre de la file, **entièrement manuel** — l'outil ne déduit aucune priorité. `POST /api/productions/reorder` le réécrit en une transaction : un classement à moitié appliqué afficherait deux rangs identiques.

`ProductionView` embarque tout ce qu'une carte de file affiche (chaîne, vidéo, étapes cochées, prochain créneau, produits et sponsos rattachés) en **une** requête. Elle porte les **listes** et non des compteurs : « 2 produits » ne dit pas lesquels, et c'est précisément ce qu'on veut savoir au survol. Compteurs et montants en attente se dérivent côté front (`partnerCounts`) — une seule source, rien à resynchroniser. Produits et sponsos sont chargés par deux requêtes pour tout le lot (`loadPartners`), comme les étapes cochées : les joindre à la ligne de production produirait un produit cartésien, trois produits face à deux sponsos donnant six lignes à dédupliquer.

`ManageProductions` possède les écritures : changer `channelId` ou `videoId` **re-synchronise** les revenus de tous les produits et sponsos rattachés (voir contrainte 6). `publish(id, videoId)` rattache la sortie, coche l'étape `publication` (si elle existe encore) et passe en `done`.

### `productionStep` et `productionSlot`

`ProductionStep { id, name, color, sortOrder, isArchived }` — table `production_steps`, seedée par `seedDefaultSteps` avec `ecriture`, `tournage`, `montage`, `miniature`, `publication` (identifiants fixes). **Ce sont des lignes, pas des colonnes** : ajouter une étape ne demande aucune migration. `sortOrder` est un ordre d'**affichage** ; les cases se cochent dans n'importe quel sens.

Table `production_step_checks` (PK `(production_id, step_id)`, colonne `checked_at`) : **la présence de la ligne vaut « coché »**. Cocher/décocher est un INSERT `DO NOTHING` / DELETE, et la date de complétion vient gratuitement. Recocher ne repousse pas la date.

`ProductionSlot { id, productionId, stepId, date, startTime, endTime, label, done, notes }` — table `production_slots`. **Les heures sont facultatives** : « samedi » est un créneau valable, et les exiger ferait renoncer à en poser un. `slotMinutes()` renvoie `0` sans horaire complet — mieux vaut sous-estimer la charge que d'inventer une durée par défaut. Le helper est dupliqué à l'identique côté front.

### `product`

`Product { id, brandId, productionId, videoId, sponsorshipId, channelId, revenueEntryId, name, url, valueCents, status, requestedAt, deadline, receivedAt, notes }` — table `products`.

`status` ∈ `discussion | confirmed | shipped | received | returned | cancelled`. Seul `received` compte en argent : c'est lui qui déclenche le revenu **en nature**. `returned` et `cancelled` existent pour que le pipeline se vide — une négo morte laissée en « en discussion » pollue la vue pour toujours.

Le revenu généré reprend la **chaîne et la vidéo de la production** : c'est ce qui fait remonter le produit dans la ligne de la bonne vidéo du tableau de performance, sans saisie de plus.

`videoId` (migration 8, sur `products` **et** `sponsorships`) rattache directement une sortie **déjà publiée**, quand elle n'a pas de fiche de production dans l'outil — tout l'historique collecté sur YouTube est dans ce cas. Les deux colonnes sont exclusives à l'usage (le champ n'en pose qu'une), et la synchronisation prend **`videoId` en priorité**, puis celui de la production : `videoId: product.videoId ?? production?.videoId ?? null`.

`sponsorshipId` (migration 6) rattache le produit à la sponso dont il fait partie. Le lien est **N:1** — une marque envoie parfois trois objets pour une seule intégration, un objet n'appartient qu'à un partenariat — et **facultatif des deux côtés** : beaucoup de produits arrivent sans contrepartie, beaucoup de sponsos sans colis. `ON DELETE SET NULL` : supprimer la sponso détache le produit, elle ne l'emporte pas.

Le lien est **purement informatif pour l'argent** : le produit vaut en nature ce que la sponso vaut en cash, les deux revenus restent distincts et rien n'est compté deux fois. `SponsorshipView` expose `productsCount` et `productsValueCents` (valeur des produits **reçus** seulement — un colis en route ne vaut encore rien).

### `sponsorship`

`Sponsorship { id, brandId, productionId, videoId, channelId, revenueEntryId, label, amountCents, status, deadline, paidAt, script, notes }` — table `sponsorships`.

`script` (migration 10, `NOT NULL DEFAULT ''` comme `productions.script`) porte le texte
de l'intégration en markdown : éléments de langage, mentions obligatoires, code promo.
Il vit sur la **sponso** et non sur la production — une même vidéo peut en porter deux,
et la sponso survit à un changement de rattachement. Il s'édite depuis son **propre
bouton** dans la table des sponsors (`SponsorshipScriptDialog`), jamais depuis la modale
d'édition : on corrige un montant en dix secondes, on écrit un script en plusieurs
passages, et un formulaire refermé par mégarde emporterait le texte.

`status` ∈ `discussion | todo | in_progress | paid | cancelled` (les quatre demandés + l'abandon, sans quoi une négo morte fausse le montant « à encaisser » à vie). Seul `paid` crée le revenu **cash**. Tant qu'elle n'est pas payée, la sponso vit dans le « à encaisser » du dashboard et **jamais dans le CA**.

### `idea`

`Idea { id, text, createdAt, updatedAt }` — table `ideas` (migration 7).

Volontairement pauvre : un texte, et rien d'autre. Lui donner une chaîne, une date ou un statut en ferait une production au rabais — or c'est justement l'absence de champs qui permet de noter une idée en trois secondes, et une idée qu'on ne note pas est une idée perdue. Le bouton « en faire une vidéo » la promeut en `Production` (son texte devient le titre de travail) et la retire du carnet. La promotion est faite **côté front en deux appels** : créer la production, puis supprimer l'idée — un endpoint dédié n'apporterait qu'une transaction sur deux écritures indépendantes, et l'idée ne doit disparaître que si la vidéo est réellement créée.

### `legal`

Le suivi administratif : la société, et une ligne par mois depuis sa création.

`Company { id, name, legalForm, siret, vatNumber, address, foundedOn, notes }` — table
`company`, **ligne unique** (`id = 'default'`, insérée par la migration). `foundedOn`
décide du **premier mois** du tableau ; sans elle, il retombe sur les 12 derniers mois.

`LegalObligation { id, label, dayOfMonth, notes, sortOrder, isArchived }` — table
`legal_obligations`, seedée par `seedLegalObligations` avec `factures-affiliation`,
`declaration-produits`, `urssaf` (jour 15), `des` (jour 15) — identifiants fixes.
**Ce sont des lignes, pas des colonnes** : même raison que les étapes de production, en
ajouter une ne demande aucune migration, et le référentiel se gère depuis
Paramètres → Société.

`dayOfMonth` est le **jour limite dans le mois**. `null` = pas d'échéance connue : c'est
le mois entier qui fait foi, et rien n'est en retard tant qu'il n'est pas terminé. Un 31
sur un mois de 30 jours est ramené au dernier jour (`dueDateOf`).

Table `legal_checks` (PK `(obligation_id, month)`, colonne `checked_at`, `month` au
format `AAAA-MM`) : **la présence de la ligne vaut « fait »**. Cocher/décocher est un
INSERT `DO NOTHING` / DELETE, et la date de réalisation vient gratuitement — recocher ne
la repousse pas.

`GetLegalOverview.execute()` renvoie `{ company, obligations, months, alerts, totals }`.
`months` va du mois en cours à la création, **du plus récent au plus ancien** (garde-fou
à 180 mois : une date de création saisie de travers ne doit pas produire mille lignes).

Le **statut d'une case est calculé côté API** (`done | late | due_soon | pending`) : la
pastille du tableau et l'alerte du dashboard doivent dire la même chose de la même case,
et une règle dupliquée finirait par diverger. `due_soon` = échéance dans les 7 jours.
`alerts` reprend les `late` et `due_soon`, la plus ancienne échéance d'abord, plafonnées
à 8 — au-delà, une alerte devient un tableau qu'on ne lit plus.

Toutes les obligations actives s'appliquent à **tous** les mois de la période : c'est
l'archivage qui retire celle qui n'a plus lieu d'être, sans effacer l'historique coché.

### `analytics`

`GetAnalytics.execute(query)` renvoie `{ query, series, totals, byCategory, byExpenseCategory, byChannel, videos, videoPerformance, previousTotals }`. `byCategory` = répartition des revenus (AdSense inclus), `byExpenseCategory` = celle des dépenses. `previousTotals` couvre la période précédente de même longueur, pour les variations en %.

`videos` liste les sorties de la période sous forme de `VideoMarker { id, channelId, channelName, channelColor, title, thumbnailUrl, date, bucket }`. **`bucket` est calculé côté API** (`bucketStart`) et tombe exactement sur un `series[].date` : la règle de découpage (semaine ISO commençant le lundi) n'existe qu'à un seul endroit.

`totals` porte aussi deux compteurs de cardinalité, `videosPublished` et `inKindEntries` (nombre de produits reçus, pas leur montant). Ils sont posés par `applyCounts()` après `sumTotals()` : les compter bucket par bucket les ferait doubler dès qu'une entrée tombe à cheval sur un découpage.

`videoPerformance` est une ligne par vidéo sortie dans la période : les compteurs collectés (`views`, `watchHours`, `subscribersGained`, `hasStats`) et l'argent, décomposé en `adsenseCents` / `manualCashCents` / `inKindCents` / `expenseCents` — les mêmes noms que `MoneyParts`, pour que le front y applique `moneyValue` comme à n'importe quel point de série. **L'argent rattaché ignore les bornes de la période** (`sumByVideo` n'a pas de filtre de date) : une sponso encaissée deux mois après la sortie appartient quand même à la vidéo qui l'a rapportée. C'est pour ça que ces montants ne se recoupent pas avec `totals`.

Chaque `TimeSeriesPoint` porte aussi `revenueByCategory` et `expenseByCategory` (`Record<categoryId, cents>`, les zéros omis) : c'est ce qui permet au `MoneyChart` d'empiler une barre par catégorie avec **sa** couleur. Deux dictionnaires séparés, sinon une catégorie `both` mélangerait ce qui rentre et ce qui sort le même jour.

## Endpoints API

Base : `http://localhost:3001`. En prod, nginx proxifie `/api/` vers le conteneur API.

| Méthode  | Route                                | Rôle                                                                                                                                                                                                  |
| -------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/health`                            | Sonde du conteneur                                                                                                                                                                                    |
| `GET`    | `/api/analytics`                     | Séries + cumuls. Params : `from`, `to`, `granularity` (`day\|week\|month`), `channelIds` (CSV, vide = cumulé), `includeUnassigned`                                                                    |
| `POST`   | `/api/analytics/collect`             | Collecte immédiate de toutes les chaînes                                                                                                                                                              |
| `GET`    | `/api/channels`                      | Liste + `latestSnapshot` + `lastMetricDate`. Param `includeArchived`                                                                                                                                  |
| `POST`   | `/api/channels`                      | Créer                                                                                                                                                                                                 |
| `POST`   | `/api/channels/resolve`              | `{ query }` (@handle / URL / UC…) → identifiant + stats                                                                                                                                               |
| `PATCH`  | `/api/channels/:id`                  | Modifier (`refreshToken: ""` efface, absent = conserve)                                                                                                                                               |
| `DELETE` | `/api/channels/:id`                  | Supprimer                                                                                                                                                                                             |
| `POST`   | `/api/channels/:id/collect`          | Collecter cette chaîne                                                                                                                                                                                |
| `PUT`    | `/api/channels/:id/metrics`          | Saisie manuelle d'une journée (`source = manual`)                                                                                                                                                     |
| `DELETE` | `/api/channels/:id/metrics/:date`    | Supprimer une journée                                                                                                                                                                                 |
| `PUT`    | `/api/channels/:id/snapshots`        | Saisie manuelle d'un total d'abonnés                                                                                                                                                                  |
| `GET`    | `/api/videos`                        | Sorties de vidéo. Params `from`, `to`, `channelIds`, `limit` (200 par défaut). Période **facultative** : le sélecteur de rattachement doit proposer des vidéos plus anciennes que la période affichée |
| `GET`    | `/api/categories`                    | Params `includeArchived`, `scope` (`revenue                                                                                                                                                           | expense | both`;`both` répond toujours) |
| `POST`   | `/api/categories`                    | Créer (`scope` défaut `revenue`)                                                                                                                                                                      |
| `PATCH`  | `/api/categories/:id`                | Modifier / archiver                                                                                                                                                                                   |
| `DELETE` | `/api/categories/:id`                | Refusé si `isAuto` ou si des revenus/dépenses y sont rattachés                                                                                                                                        |
| `GET`    | `/api/revenues`                      | Params `from`, `to`, `channelIds`                                                                                                                                                                     |
| `POST`   | `/api/revenues`                      | `amount` **en euros**, `videoId` facultatif. Refusé sur une catégorie `isAuto` ou `scope: expense`                                                                                                    |
| `PATCH`  | `/api/revenues/:id`                  | Modifier                                                                                                                                                                                              |
| `DELETE` | `/api/revenues/:id`                  | Supprimer                                                                                                                                                                                             |
| `GET`    | `/api/expenses`                      | Params `from`, `to`, `channelIds`                                                                                                                                                                     |
| `POST`   | `/api/expenses`                      | `amount` **en euros**, positif, `videoId` facultatif. `categoryId` obligatoire, refusé sur `scope: revenue`                                                                                           |
| `PATCH`  | `/api/expenses/:id`                  | Modifier                                                                                                                                                                                              |
| `DELETE` | `/api/expenses/:id`                  | Supprimer                                                                                                                                                                                             |
| `GET`    | `/api/brands`                        | Param `includeArchived`                                                                                                                                                                               |
| `GET`    | `/api/brands/stats`                  | Classements du dashboard. Params `from`, `to`, `channelIds`. **Déclaré avant `/:id`**                                                                                                                 |
| `POST`   | `/api/brands`                        | Créer                                                                                                                                                                                                 |
| `PATCH`  | `/api/brands/:id`                    | Modifier / archiver                                                                                                                                                                                   |
| `DELETE` | `/api/brands/:id`                    | Refusé en 409 si des produits ou sponsos y sont rattachés                                                                                                                                             |
| `GET`    | `/api/productions`                   | Params `statuses` (CSV), `channelIds`, `from`/`to` (sur `plannedDate`), `search`                                                                                                                      |
| `GET`    | `/api/productions/overview`          | File d'attente + alertes + créneaux + charge de la semaine. **Déclaré avant `/:id`**                                                                                                                  |
| `GET`    | `/api/productions/:id`               | Une production (`ProductionView`)                                                                                                                                                                     |
| `POST`   | `/api/productions`                   | Créer (entre en **fin** de file)                                                                                                                                                                      |
| `POST`   | `/api/productions/reorder`           | `{ ids }` → l'ordre manuel de la file, le rang est l'index                                                                                                                                            |
| `PATCH`  | `/api/productions/:id`               | Modifier (dont `script`)                                                                                                                                                                              |
| `DELETE` | `/api/productions/:id`               | Supprimer ; produits et sponsos sont **détachés**, pas supprimés                                                                                                                                      |
| `POST`   | `/api/productions/:id/publish`       | `{ videoId }` → rattache la sortie, coche la publication, passe en `done`                                                                                                                             |
| `PUT`    | `/api/productions/:id/steps/:stepId` | Cocher une étape (idempotent)                                                                                                                                                                         |
| `DELETE` | `/api/productions/:id/steps/:stepId` | Décocher                                                                                                                                                                                              |
| `GET`    | `/api/production-steps`              | Référentiel des étapes. Param `includeArchived`                                                                                                                                                       |
| `POST`   | `/api/production-steps`              | Créer                                                                                                                                                                                                 |
| `PATCH`  | `/api/production-steps/:id`          | Modifier / archiver / réordonner                                                                                                                                                                      |
| `DELETE` | `/api/production-steps/:id`          | Supprimer (les cases cochées partent en cascade)                                                                                                                                                      |
| `GET`    | `/api/production-slots`              | Params `productionIds`, `from`, `to`, `includeDone`                                                                                                                                                   |
| `POST`   | `/api/production-slots`              | `productionId` dans le corps                                                                                                                                                                          |
| `PATCH`  | `/api/production-slots/:id`          | Modifier / marquer fait                                                                                                                                                                               |
| `DELETE` | `/api/production-slots/:id`          | Supprimer                                                                                                                                                                                             |
| `GET`    | `/api/products`                      | Params `statuses`, `brandIds`, `productionIds`, `channelIds`                                                                                                                                          |
| `POST`   | `/api/products`                      | `value` **en euros**. `received` déclenche le revenu en nature                                                                                                                                        |
| `PATCH`  | `/api/products/:id`                  | Modifier (re-synchronise le revenu)                                                                                                                                                                   |
| `DELETE` | `/api/products/:id`                  | Supprimer (le revenu lié part avec)                                                                                                                                                                   |
| `GET`    | `/api/sponsorships`                  | Mêmes params que les produits                                                                                                                                                                         |
| `POST`   | `/api/sponsorships`                  | `amount` **en euros**. `paid` déclenche le revenu cash                                                                                                                                                |
| `PATCH`  | `/api/sponsorships/:id`              | Modifier (re-synchronise le revenu)                                                                                                                                                                   |
| `DELETE` | `/api/sponsorships/:id`              | Supprimer (le revenu lié part avec)                                                                                                                                                                   |

Erreurs : `{ error, code, details? }`. `422` pour une validation zod (avec `details[].field`), `409` pour un conflit métier, `502` pour une erreur YouTube.

## Routes front

| Route               | Page                   | Contenu                                                                                                                                                |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                 | `DashboardPage`        | 10 cartes de stats, alertes (production + légal), **les deux graphiques seulement** (argent, audience), aperçu de la file de production et du pipeline |
| `/contenu`          | `ContentPage`          | 5 cartes d'audience, graphique d'audience, classement + tableau de performance par vidéo, dernières sorties (hors période), file de production         |
| `/production`       | `ProductionPage`       | Alertes, **planning en permanence**, puis 2 onglets : file d'attente (créneaux et carnet d'idées à droite) / terminées                                 |
| `/production/:id`   | `ProductionDetailPage` | En-tête (statut, étapes, progression) + onglets Script / Créneaux / Produits & sponsos / Notes                                                         |
| `/partenariats`     | `PartnersPage`         | 4 cartes de pipeline (`PartnerStatCards`), puis deux onglets Produits et Sponsors (`?onglet=`). Bouton **Script** par sponso                           |
| `/chiffre-affaires` | `TurnoverPage`         | 4 cartes d'argent, puis 3 onglets (`?onglet=`) : Synthèse (graphique + répartitions + classements), Revenus, Dépenses                                  |
| `/legal`            | `LegalPage`            | Fiche société, avancement, alertes, tableau mensuel à cocher — un onglet par année (`?annee=`)                                                         |
| `/chaines`          | `ChannelsPage`         | Cartes des chaînes, collecte, saisie manuelle                                                                                                          |
| `/categories`       | `CategoriesPage`       | Gestion des catégories : portée, nature, couleur                                                                                                       |
| `/marques`          | `BrandsPage`           | Référentiel des marques (paramètres)                                                                                                                   |
| `/etapes`           | `StepsPage`            | Référentiel des étapes de production (paramètres)                                                                                                      |
| `/societe`          | `CompanyPage`          | Fiche société éditable + référentiel des obligations mensuelles (paramètres)                                                                           |

`/revenus`, `/depenses` et `/taxes` **redirigent** vers `/chiffre-affaires` sur le bon
onglet : ce sont les deux moitiés de la même soustraction, et elles se consultent l'une
après l'autre. Les tables vivent désormais dans `components/money/RevenuesPanel.tsx` et
`ExpensesPanel.tsx` — ce sont les anciennes pages, déplacées telles quelles.

`AppLayout` porte la navigation : Dashboard / Contenu / Production / Partenariats / Chiffre d'affaires / Légal dans la barre, **Chaînes, Catégories, Marques, Étapes et Société dans le menu ⚙ Paramètres** en haut à droite. L'ordre des deux boutons de droite est **thème puis paramètres** : le thème se change une fois, les paramètres s'ouvrent souvent, et ce qui s'ouvre en menu déroulant est à l'extrémité pour ne pas déborder (ce sont des écrans de configuration, pas de lecture). Le bouton ⚙ s'allume sur `SETTINGS_NAV`, pas sur l'absence de filtres : `/production` n'a pas de barre de filtres sans être pour autant un écran de configuration. La largeur du site est fixée une fois pour toutes par la constante `CONTAINER` (`max-w-[1800px]`), partagée par l'en-tête et le contenu.

La `FiltersBar` vit **dans l'en-tête collant**, sans trait de séparation : elle en fait partie. Elle n'apparaît pas sur les routes de `ROUTES_WITHOUT_FILTERS` (`/chaines`, `/categories`, `/marques`, `/etapes`, `/societe`, `/production`, `/partenariats`, `/legal` — une vidéo à écrire n'appartient à aucune fenêtre de temps, et le tableau légal a sa propre maille, le mois) — configurer une chaîne ne dépend d'aucune période — et les pages ne la rendent donc plus elles-mêmes. Deux rangées, dans l'ordre où on s'en sert :

1. **quand** : préréglages de période (dont `mtd`, « Ce mois », qui part du 1er du mois en cours), dates personnalisées, pas d'agrégation, et le bouton « Collecter » à l'autre bout de cette même rangée ;
2. **quoi et comment le lire** : puces de chaînes, puis l'interrupteur **CA / Bénéfices** et les coches « Compter les produits reçus » et « Marquer les sorties de vidéo ».

Ces trois réglages pilotent **tous** les graphiques et toutes les cartes : les laisser dans l'un des graphiques obligeait à remonter pour changer d'avis. Le titre du graphique d'argent suit l'interrupteur, il ne le porte plus. `FiltersBar` lit le nombre de sorties via `useAnalytics(useAnalyticsParams())` — même clé de cache que le dashboard, donc requête partagée et non dupliquée.

Deux cartes déplient un panneau au survol (prop `details` de `StatCard`, ouvert aussi au clavier via `focus-within`) : « Vidéos publiées » montre les miniatures des sorties, « Produits reçus » la liste des produits et leur valeur. Le détail des produits ne vient pas d'`analytics`, qui n'expose que des agrégats, mais de `useRevenues` borné **exactement** comme le dashboard — sans quoi le panneau contredirait le total juste au-dessus.

La carte « Abonnés gagnés » met le **gain** en grand et le total en sous-titre : sur une période, ce qui se pilote est la progression, pas un cumul qui ne bouge qu'à la marge.

Disposition du dashboard, de haut en bas : 10 cartes de stats (2 colonnes en mobile, 5 à partir de `lg`), les deux bandeaux d'alertes (production, légal), les graphiques d'argent et d'audience **côte à côte** à partir de `2xl`, puis l'aperçu de la file de production et deux cartes de pipeline. **C'est tout** : anneaux, classements de partenaires et performance par vidéo ont migré vers `/chiffre-affaires` et `/contenu`, parce qu'empilés ici ils faisaient une page qu'on parcourait au lieu de la lire.

Les deux dernières cartes de stats — « Sponsos en cours » et « Produits attendus » — **ne suivent pas la période** : ce sont des états du pipeline, pas des flux. Une sponso signée en mars et pas encore payée est toujours à encaisser en juin. Leur sous-titre le dit, pour qu'on ne les lise pas comme un cumul de période.

## Hooks

| Hook                                                                                                                                                                                              | Fichier                                               | Rôle                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `useFilters` / `FiltersProvider`                                                                                                                                                                  | `presentation/hooks/useFilters.tsx`                   | Période, chaînes, mode CA/bénéfice, en nature, repères de sortie de vidéo. Persisté en localStorage |
| `useAnalyticsParams`                                                                                                                                                                              | idem                                                  | Paramètres prêts pour `useAnalytics`                                                                |
| `useAnalytics`, `useCollectAll`                                                                                                                                                                   | `application/analytics/usecases/useAnalytics.ts`      | Requête principale du dashboard                                                                     |
| `useChannels`, `useCreateChannel`, `useCollectChannel`, `useSaveManualMetrics`, `useSaveManualSnapshot`, `useResolveChannel`                                                                      | `application/channel/usecases/useChannels.ts`         | CRUD chaînes + collecte                                                                             |
| `useCategories`, `useCreateCategory`, …                                                                                                                                                           | `application/category/usecases/useCategories.ts`      | Catégories (param `{ includeArchived, scope }`)                                                     |
| `useVideos`                                                                                                                                                                                       | `application/video/usecases/useVideos.ts`             | Sorties de vidéo pour le sélecteur de rattachement (cache 5 min)                                    |
| `useRevenues`, `useCreateRevenue`, …                                                                                                                                                              | `application/revenue/usecases/useRevenues.ts`         | Revenus                                                                                             |
| `useExpenses`, `useCreateExpense`, …                                                                                                                                                              | `application/expense/usecases/useExpenses.ts`         | Dépenses                                                                                            |
| `useTheme`, `useLocalStorage`                                                                                                                                                                     | `presentation/hooks/`                                 | Thème clair/sombre, stockage protégé                                                                |
| `useBrands`, `useBrandStats`, `useCreateBrand`, …                                                                                                                                                 | `application/brand/usecases/useBrands.ts`             | Marques + classements du dashboard                                                                  |
| `useProductions`, `useProduction`, `useProductionOverview`, `useCreateProduction`, `useUpdateProduction`, `useDeleteProduction`, `useReorderProductions`, `usePublishProduction`, `useToggleStep` | `application/production/usecases/useProductions.ts`   | Vidéos en préparation                                                                               |
| `useProductionSteps`, `useCreateStep`, `useUpdateStep`, `useDeleteStep`                                                                                                                           | idem                                                  | Référentiel des étapes (cache 5 min)                                                                |
| `useProductionSlots`, `useCreateSlot`, `useUpdateSlot`, `useDeleteSlot`                                                                                                                           | idem                                                  | Créneaux de travail                                                                                 |
| `useProducts`, `useCreateProduct`, …                                                                                                                                                              | `application/product/usecases/useProducts.ts`         | Produits reçus                                                                                      |
| `useSponsorships`, `useCreateSponsorship`, …                                                                                                                                                      | `application/sponsorship/usecases/useSponsorships.ts` | Sponsos                                                                                             |
| `useLegalOverview`, `useLegalObligations`, `useUpdateCompany`, `useCreateObligation`, `useUpdateObligation`, `useDeleteObligation`, `useToggleLegalCheck` | `application/legal/usecases/useLegal.ts` | Société + obligations mensuelles |

Toute mutation d'argent invalide `['analytics', 'revenues', 'expenses']` (`MONEY_ROOTS`, `application/queryKeys.ts`). Une mutation de catégorie invalide en plus `['categories']` : elle change les couleurs et les libellés de tous les graphiques.

`LEGAL_ROOTS` (`legalOverview`, `legalObligations`) part en entier à chaque écriture du module légal : changer un jour limite déplace l'échéance sur tous les mois déjà affichés, et cocher une case retire une alerte du dashboard.

`PRODUCTION_ROOTS` couvre le module de production, et `PARTNER_ROOTS` y ajoute `MONEY_ROOTS` + `brandStats` : **une écriture de produit ou de sponso crée, modifie ou supprime un revenu**, les vues d'argent doivent donc repartir en même temps. Le découpage n'est pas plus fin volontairement — un seul changement de statut peut faire bouger les alertes, les compteurs de la file et les classements, et le module est assez petit pour que le refetch soit indolore.

## Patterns

- **Client HTTP centralisé** : aucun `fetch` hors de `infrastructure/http/httpClient.ts`.
- **Repositories** : interfaces dans `domain/`, implémentations SQLite dans `infrastructure/`, assemblage dans `container.ts`.
- **Validation** : tous les corps de requête passent par un schéma zod de `presentation/validation.ts`. Les erreurs `ZodError` sont converties en 422 par `errorHandler`.
- **Params de route** : toujours via `param(req, 'id')` (`presentation/helpers.ts`) — Express 5 type `req.params` en `string | string[] | undefined`.
- **Migrations** : tableau ordonné dans `infrastructure/db/migrations.ts`, suivi par `PRAGMA user_version`, appliquées en transaction au démarrage. **Ajouter une migration, ne jamais modifier une existante.** La migration 3 ajoute la table `videos`. La migration 4 ajoute les compteurs par vidéo et les colonnes `video_id` de `revenue_entries` / `expense_entries` — une clé étrangère n'est ajoutable par `ALTER TABLE` que si son défaut vaut `NULL`, ce qui est le cas ici. La migration 2 renomme `revenue_categories` en `categories` (SQLite réécrit les clés étrangères des autres tables toute seule), ajoute `scope`, et transforme `tax_entries` en `expense_entries` en rattachant l'existant à la catégorie `impots`.
- **Couleurs de chaîne** attribuées en rotation à la création (`DEFAULT_COLORS`).
- **Use case propriétaire d'une écriture** : dès qu'une écriture a un effet de bord ailleurs (les revenus générés), elle vit dans un use case (`ManageProducts`, `ManageSponsorships`, `ManageProductions`) et la route ne touche plus le dépôt. Le dépôt garde une méthode technique (`setRevenueEntryId`) réservée à ce use case.
- **Sentinelle des `Select` facultatifs** : `NONE` / `toSelectValue` / `fromSelectValue` (`presentation/components/forms/selectNone.ts`). Radix refuse une `SelectItem` de valeur vide ; la sentinelle est partagée pour que trois formulaires n'en inventent pas trois différentes.
- **Référentiel plutôt que colonnes** : les étapes de production sont des lignes (`production_steps`) et l'état « coché » est la **présence** d'une ligne dans `production_step_checks`. En ajouter une ne demande aucune migration, et la date de complétion vient gratuitement.
- **Migration 5** ajoute `brands`, `production_steps`, `productions`, `production_step_checks`, `production_slots`, `products`, `sponsorships`, et la colonne `revenue_entries.origin`. **Migration 6** ajoute `products.sponsorship_id`, **migration 7** la table `ideas`, **migration 8** `products.video_id` et `sponsorships.video_id`.
- **Migration 9** ajoute `company` (ligne unique), `legal_obligations` et `legal_checks`. **Migration 10** ajoute `sponsorships.script`.
- **Un panneau plutôt qu'une page dès que deux écrans le partagent** : `RevenuesPanel` et `ExpensesPanel` (ex-pages) sont montés dans les onglets de `/chiffre-affaires` ; `MoneyBreakdowns` porte les trois anneaux et les deux classements ; `PartnerStatCards` les quatre chiffres du pipeline ; `ProductionQueueCard` l'aperçu de la file. Chacun est monté à deux endroits au moins, et le dupliquer ferait diverger deux écrans qui doivent annoncer le même montant.
- **Un aperçu ne se manipule pas** : `ProductionQueueCard` affiche la file mais ne réordonne rien et ne coche aucune étape — ces gestes vivent sur `/production`, propriétaire de la file. Un aperçu modifiable finit par diverger de l'écran qui en est propriétaire.
- **Le calcul du pipeline vit dans le domaine** (`domain/partner/services/pipeline.ts`, `partnerPipeline`) et non dans les écrans : le dashboard et `/partenariats` affichent le même « à encaisser », et deux comptages parallèles finiraient par se contredire.
- **Contraste calculé, pas choisi** : `shared/contrast.ts` (`readableTextColor`) prend une couleur de fond libre et renvoie le blanc ou l'encre du thème, selon le meilleur **ratio WCAG réel** des deux. Les couleurs de chaîne sont libres — un vert clair et un bleu nuit peuvent cohabiter, et écrire en blanc sur les deux rend le premier illisible.

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
- **Un revenu généré ne se modifie pas depuis l'écran Revenus.** L'API répond 409 et `RevenuesPage` grise les deux boutons en affichant un badge cliquable vers la fiche : sans ce badge, le bouton grisé serait vécu comme une panne. Corriger le montant se fait sur le produit ou la sponso, et la mise à jour redescend toute seule.
- **La production porte la chaîne et la vidéo, pas le produit.** Changer l'une des deux sur une production re-synchronise les revenus de tous ses produits et sponsos (`ManageProductions.update` → `resyncProduction`). Sans ça, une sponso resterait rattachée à l'ancienne vidéo et fausserait son tableau de performance.
- **Supprimer une production ne supprime pas ses produits ni ses sponsos** (`ON DELETE SET NULL`), mais `ManageProductions.remove` les re-synchronise après coup : leurs revenus doivent perdre le rattachement à la vidéo qui vient de disparaître. Les identifiants sont collectés **avant** la suppression, sinon plus rien ne les relierait.
- **Les vidéos n'arrivent qu'avec une collecte** — donc « Marquer publiée » n'a rien à proposer sur une base qui n'a jamais collecté. Même piège que la case « Marquer les sorties de vidéo ».
- **`PublishDialog` trie les sorties par proximité avec la date visée**, pas par date : celle qu'on cherche est presque toujours sortie près du jour prévu, et elle doit être en tête sans faire défiler des mois d'historique.
- **L'éditeur de script n'enregistre pas tout seul.** Perdre une version d'un script coûte plus cher qu'un clic, et une sauvegarde continue écraserait un brouillon en cours de réflexion. L'indicateur « Non enregistré » rend l'oubli visible. Le compteur affiche la **durée de lecture** (150 mots/min) plutôt que des caractères : c'est la seule mesure qui compte quand on écrit pour être dit à l'oral.
- **Le rendu markdown est stylé à la main** (`.prose-script` dans `index.css`), sans `@tailwindcss/typography` : un script n'a besoin que de titres, listes, gras et tableaux, et la palette doit rester celle du thème plutôt qu'un gris importé qui jurerait en mode sombre. `react-markdown` est isolé dans son propre chunk (`manualChunks.markdown`) : il n'est téléchargé que par ceux qui ouvrent une fiche de production.
- **Le Gantt est une grille CSS maison**, sans bibliothèque : une barre par production, une colonne par jour, rien d'autre que des jours à compter. Sans `startDate`, la barre occupe le seul jour visé — une vidéo qu'on n'a pas commencé à planifier ne doit pas paraître étalée sur trois semaines.
- **Dans le Gantt, la couleur dit la chaîne et le contenu dit l'avancement** : une icône `$` s'il y a une sponso, une icône de carton s'il y a un produit, l'état, et le pourcentage d'étapes cochées. Écrire le nom de la chaîne serait redondant avec sa couleur ; ces quatre-là ne se lisent nulle part ailleurs sur cette vue. **L'ordre suit ce qui doit survivre au rognage** : icônes et pourcentage sont `shrink-0`, c'est le libellé d'état qui se tronque en premier — sur une barre d'un jour, savoir qu'il y a une sponso vaut mieux que lire « En cours ». L'infobulle (`barTitle`) reprend tout ce que le rognage a pu manger. La barre entière est un lien vers la fiche : c'est la cible la plus large de la ligne. Le texte prend sa couleur de `readableTextColor(fond)`.
- **Le planning est affiché en permanence sur `/production`, pas dans un onglet** : « qu'est-ce qui sort quand » est la première question de la page. Il se replie à `COLLAPSED_ROWS` (5) lignes pour ne pas repousser la file d'attente sous le pli, et trie les vidéos encore à faire avant les terminées.
- **Le carnet d'idées vit à côté de la file d'attente**, sous les prochains créneaux : une idée se note pendant qu'on regarde ce qu'on est en train de faire, pas dans un écran à part. Champ + Entrée, et c'est noté ; le champ se vide aussitôt parce qu'on note souvent trois idées d'affilée. Le texte s'édite sur place, **validé à la sortie du champ** (même piège que `StepsPage` : une mutation par frappe partirait à chaque lettre).
- **Les classements de partenaires sont des barres, pas des anneaux.** Sur un top-N ordonné, ce qui se lit est le rang et l'écart au premier : une longueur le donne, un angle non. Les barres sont proportionnelles au **maximum** de la liste et non au total — un classement n'est pas une répartition, et rapporter au total écraserait tout le bas de liste.
- **`StepsPage` édite en champs non contrôlés, validés à la sortie** (`defaultValue` + `onBlur`) : un `onChange` branché sur la mutation enverrait une requête par lettre tapée.
- **« La vidéo concernée » est un seul champ pour deux mondes.** `VideoTargetSelect` liste les vidéos **en préparation** (`productions`) puis les sorties **déjà publiées** (`/api/videos`), en deux groupes, les plus récentes d'abord. Les séparer en deux sélecteurs obligerait à savoir d'avance dans quel monde chercher, alors qu'on cherche simplement la vidéo — parfois faite, parfois pas. L'encodage (`prod:` / `video:`) vit dans `videoTarget.ts` : sans préfixe, un `Select` ne saurait pas laquelle des deux tables a été désignée. Une sortie déjà revendiquée par une production **n'apparaît pas** dans le second groupe, sinon il faudrait choisir entre deux entrées identiques dont une seule porte le script et les créneaux.
- **Le bouton + des revenus en nature manuels crée la fiche produit manquante.** Il n'est proposé que sur `origin === 'manual'` et `nature === 'in_kind'` : ce sont les produits reçus saisis à la main, dont la marque, l'échéance et la sponso associée n'existent nulle part. Le formulaire s'ouvre pré-rempli (nom, valeur, date, chaîne, vidéo), et **l'entrée manuelle est supprimée après la création** — la fiche en régénère une équivalente en `origin: 'product'`, sinon le même euro compterait deux fois. Créer d'abord, supprimer ensuite : l'inverse perdrait la saisie si la création échouait.
- **« Publiée » se lit toujours de la même façon : `videoId ?? production.videoId`.** L'alerte « sponso payée, vidéo pas encore publiée » (`GetProductionOverview.isDelivered`) suit exactement la règle de la synchronisation des revenus. Ne regarder que la production faisait crier au retard sur une sponso rattachée en direct à une sortie importée depuis YouTube — qui est pourtant en ligne. Toute nouvelle règle qui parle de « la vidéo » d'un produit ou d'une sponso doit reprendre ce même `??`.
- **Un créneau s'affiche toujours pareil** (`SlotSummary`) : l'étape en titre — c'est elle qui dit ce qu'on va faire —, l'intitulé libre en dessous, puis date, horaire et vidéo. Les deux écrans qui en listent (les prochains créneaux de `/production` et l'onglet Créneaux d'une fiche) passent par ce composant : dupliqué, le rendu divergeait dès la première retouche.
- **Les deux tables de `/partenariats` ne se trient pas pareil**, et c'est voulu : les **produits** par date de réception décroissante — la table se lit comme un journal de ce qui est arrivé —, les **sponsos** par échéance croissante — ce qui compte est ce qu'on doit encore livrer. Dans les deux cas les lignes sans date ferment la liste : sans date de réception le produit n'est pas arrivé, sans échéance la sponso n'a pas d'urgence connue. Le tri vit dans les dépôts (`ORDER BY`), donc il vaut aussi pour les sélecteurs de rattachement.
- **Un compteur dit combien, jamais lesquels.** Les cartes de la file déplient la liste des produits et des sponsos au survol (`PartnerHoverList` : noms, montants, statuts, les en-attente en accent) — même mécanique CSS que le panneau des `StatCard`, ouvert aussi au clavier, sans bibliothèque de tooltip. Dans le **planning**, les icônes `$` et carton portent une infobulle **native** et non ce panneau : la vue défile horizontalement dans un conteneur qui rogne, un panneau en position absolue y serait coupé dès qu'on approche du bord.
- **Un créneau du jour dit « Aujourd'hui »**, dans la couleur qui marque déjà le présent sur le planning, et sa ligne se détache dans « Prochains créneaux » (filet à gauche + fond accentué). Lire « 02 sept. » demande de comparer mentalement à la date du jour — exactement le travail qu'une liste de prochains créneaux doit éviter, et c'est le seul créneau sur lequel on peut encore agir maintenant.
- **Le champ marque se tape, et crée à la volée** (`BrandCombobox`). Un `Select` obligerait à faire défiler une liste qui grandit à chaque partenariat, et surtout à quitter le formulaire pour créer une marque inexistante — en perdant la saisie en cours. La création ne demande **que le nom** ; la couleur vient de la rotation côté API, le reste se complète dans Paramètres → Marques. « Créer » n'apparaît pas si le nom existe déjà **à la casse près** : deux « Logitech » fausseraient les classements. Écrit à la main plutôt qu'avec `cmdk` + Popover — deux dépendances pour un seul champ. Deux détails non négociables : `onMouseDown` neutralisé sur les options (sinon le champ perd le focus avant que le clic n'arrive et la liste se referme sur du vide), et le `onBlur` porté par le conteneur (refermer n'a de sens que si le focus sort de l'ensemble champ + liste).
- **Créer et rattacher sont deux gestes distincts**, tous deux courants : un produit arrive parfois avant qu'on sache pour quelle vidéo il servira. Les deux sont proposés partout où un lien existe — `SponsorshipLinkField` (produit → sponso, avec création sur place), `ProductLinkField` (sponso → produits, liste avec ajout/retrait), et `AttachExistingSelect` dans l'onglet « Produits & sponsos » d'une fiche de production. Les helpers d'écriture vivent dans `partnerLinks.ts`, qui **n'exporte aucun composant** (règle `react-refresh/only-export-components`, même découpage que `videoMarkers.tsx`).
- **Ordre d'écriture des liens.** Une sponso créée depuis un produit l'est **avant** le produit (sans identifiant, rien à référencer) ; des produits rattachés depuis une sponso le sont **après** elle (en création, son identifiant n'existe pas encore). Inverser l'un ou l'autre laisserait une fiche orpheline si la seconde écriture échouait.
- **Les listes de rattachement sont triées, pas filtrées.** Les fiches de la même marque ou de la même vidéo remontent en tête, mais rien n'est masqué : un partenariat peut croiser deux marques. Seule exception, `ProductLinkField` cache les produits déjà rattachés à **une autre** sponso — les proposer reviendrait à les voler en silence. Dans une fiche de production, en revanche, déplacer est permis et le libellé le dit (« déplacer depuis « X » »).
- **`AttachExistingSelect` reste bloqué sur `NONE`** : il déclenche une action et se réarme, il ne mémorise pas de valeur. Sans ça, le déclencheur afficherait le dernier élément rattaché et se lirait comme un filtre.
- **Détacher n'est pas supprimer.** Le bouton ⛓ des listes d'une fiche de production met `productionId` à `null` : le produit reste reçu et son revenu existe toujours, il perd juste son rattachement à la vidéo (et donc le `videoId` de son revenu, par re-synchronisation).
- **Rattacher une vidéo force la chaîne** du revenu ou de la dépense (une vidéo appartient à une seule chaîne), et changer de chaîne détache la vidéo. `VideoSelect` garde en tête de liste la vidéo déjà rattachée même si elle sort du filtre courant, sinon une édition l'effacerait silencieusement.
- **Le dashboard n'a plus que deux graphiques.** Les répartitions et les classements sont dans `/chiffre-affaires` → Synthèse, la performance par vidéo dans `/contenu`. Y remettre un graphique demande de se demander lequel il remplace : la page doit se lire d'un regard, pas se parcourir.
- **Deux temporalités cohabitent sur `/contenu`** : la performance suit la période de la barre de filtres, les « Dernières sorties » l'ignorent (`useVideos` sans bornes de date, `limit: 15`). Une période de 7 jours viderait la liste alors que c'est justement là qu'on la consulte. Les deux blocs sont côte à côte : leurs totaux ne se recoupent pas, et c'est voulu.
- **Le tableau légal s'applique rétroactivement.** Une obligation ajoutée aujourd'hui apparaît sur **tous** les mois depuis la création de la société, donc immédiatement « en retard » sur les mois passés. C'est le comportement demandé (une ligne par mois depuis la création) ; pour retirer une obligation devenue caduque sans perdre l'historique coché, l'**archiver** plutôt que la supprimer — la supprimer efface les cases de tous les mois.
- **Sans `company.foundedOn`, le tableau légal retombe sur les 12 derniers mois** (`FALLBACK_MONTHS`). Ce n'est pas un bug : c'est ce qui permet de cocher quelque chose avant d'avoir renseigné la fiche. La date se saisit dans Paramètres → Société.
- **Le mois d'une case est `AAAA-MM`, jamais une date.** `/api/legal/checks/:id/:month` valide le format en 422 : un `2026-3` passerait silencieusement à côté de toutes les lignes existantes, et la case paraîtrait ne jamais se cocher.
- **Le script d'une sponso a son propre bouton**, pas une case dans la modale d'édition : `SponsorshipScriptDialog` réutilise le `ScriptEditor` des productions (même markdown, même durée de lecture, même absence d'enregistrement automatique). `PartnersPage` garde l'**identifiant** de la sponso ouverte et non la fiche : après enregistrement la liste est rechargée, et un instantané figé laisserait l'éditeur croire éternellement qu'il reste du non-enregistré.

## Déploiement

Images publiées sur GHCR par `.github/workflows/release.yml` :
`ghcr.io/aymericlefeyer/aylabs-creator-studio-api` et `-web`.

| Déclencheur          | Tags d'image produits              |
| -------------------- | ---------------------------------- |
| push sur `main`      | `latest` + `main-sha-<court>`      |
| tag `v1.2.3`         | `1.2.3`, `1.2`, `latest`           |
| déclenchement manuel | le tag saisi (`latest` par défaut) |

`release.yml` appelle `ci.yml` (`workflow_call`) en job `check` avant de builder : **aucune image n'est publiée si le typage, le lint, le format ou le build échouent**. C'est pour ça que `ci.yml` ne se déclenche plus sur `push: main` — sinon les vérifications tourneraient deux fois pour un même commit. Un `concurrency` annule la build précédente encore en cours sur la même ref, pour que deux pushes rapprochés ne se disputent pas le tag `latest`.

Sur le VPS, stack Portainer à partir de `docker-compose.yml`. Variables : `YOUTUBE_API_KEY`, `GCP_CLIENT_ID`, `GCP_CLIENT_SECRET`, `WEB_PORT`, `TAG`. Le volume `creator-studio-data` porte la base — **ne pas le supprimer entre deux déploiements**.

Build local des images : `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`.
