# Aylabs Creator Studio

> Dernière mise à jour : 2026-09-04

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
| PWA        | Manifeste + service worker **écrits à la main**, aucune dépendance de build         |
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

`VideoRepository` : `findAll`, `findAllWithChannel`, `findById`, `upsertMany` (titre/miniature, jamais les compteurs), `upsertStats` (compteurs seuls, **UPDATE sans INSERT** : une stat sans ligne de vidéo n'a nulle part où aller), `markMissing`, `findLatestDate`, `countByChannel`.

**Une vidéo retirée de YouTube est marquée, jamais supprimée** (`videos.deleted_at`,
migration 17). La supprimer emporterait tout ce qui s'y rattache : revenus et dépenses
détachés (`ON DELETE SET NULL`), production privée de sa sortie, relevés de
`video_stat_snapshots` partis en cascade. Le marquage garde l'argent là où il a été
gagné, et reste **réversible**.

`markMissing(channelId, since, presentExternalIds)` tourne après chaque `upsertMany` :
tout ce que YouTube ne renvoie plus **dans la fenêtre collectée** est marqué, et tout ce
qui réapparaît est démarqué. Trois garde-fous, chacun pour une raison précise :

- **borné à `since`** — la collecte ne remonte qu'à la dernière vidéo connue moins
  quelques jours ; comparer au-delà ferait passer tout l'historique antérieur pour
  supprimé ;
- **un lot vide ne marque rien** — une liste vide est bien plus souvent un quota épuisé
  ou une réponse tronquée qu'une chaîne entièrement effacée ;
- **le démarquage est automatique** — en mode `public`, la playlist « uploads » ne
  renvoie pas les vidéos **privées ou non listées** : une vidéo simplement masquée est
  indiscernable d'une vidéo effacée, et elle revient d'elle-même si elle repasse en public.

Le filtre `deleted_at IS NULL` vit dans le seul `buildWhere` du dépôt : toutes les
lectures en héritent (liste, compteurs de période, repères de graphique, performance par
vidéo), et `findLatestDate` l'applique aussi — une vidéo retirée ne doit pas servir de
point de reprise à la collecte suivante.

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

`ProductionStep { id, name, color, sortOrder, defaultMinutes, isArchived }` — table
`production_steps`, seedée **à la création de la base** par `seedDefaultSteps` avec
`ecriture`, `tournage`, `montage`, `miniature`, `publication` (identifiants fixes).
**Ce sont des lignes, pas des colonnes** : ajouter une étape ne demande aucune migration.
`sortOrder` est un ordre d'**affichage** ; les cases se cochent dans n'importe quel sens.

**L'ordre se réécrit en entier**, jamais par échange de deux rangs :
`POST /api/production-steps/reorder` et `POST /api/step-todos/reorder` reçoivent la liste
complète et posent `1..n` en transaction. L'échange deux à deux qui existait avant ne
marchait que si les rangs étaient distincts — or une étape créée à la main prend `MAX + 1`,
et deux rangs égaux s'échangeaient sans que rien ne bouge. L'ordre est **global** : il vaut
pour toutes les vidéos, et les écrans qui le proposent depuis une fiche le disent.

Table `production_step_checks` (PK `(production_id, step_id)`, colonne `checked_at`) : **la présence de la ligne vaut « coché »**. Cocher/décocher est un INSERT `DO NOTHING` / DELETE, et la date de complétion vient gratuitement. Recocher ne repousse pas la date.

`ProductionSlot { id, productionId, stepId, date, startTime, endTime, label, done, notes }` — table `production_slots`. **Les heures sont facultatives** : « samedi » est un créneau valable, et les exiger ferait renoncer à en poser un. `slotMinutes()` renvoie `0` sans horaire complet — mieux vaut sous-estimer la charge que d'inventer une durée par défaut. Le helper est dupliqué à l'identique côté front.

### `timeEntry` — le temps passé

`TimeEntry { id, productionId, stepId, todoId, startedAt, endedAt, minutes, notes }` — table
`production_time_entries` (migration 12, `todo_id` en migration 19).

**Le temps se qualifie à la sous-étape**, pas seulement à l'étape. « Le montage me prend
deux fois plus que je ne le crois » se lit déjà à l'étape ; « c'est le sound design qui
mange le montage » ne se lit nulle part ailleurs — et c'est la seule maille sur laquelle
on peut agir. C'est aussi celle sur laquelle le planning réserve du temps
(`planning_items.todo_id`), donc la seule qui permette de comparer l'estimation au vécu.
`todo_id` reste **facultatif** : mieux vaut un temps mal rangé qu'un temps jamais mesuré.

Comme partout ailleurs, `todo_id` désigne `step_todos` **ou** `production_todos` : aucune
clé étrangère n'est possible, et `TimeEntryView.todoLabel` vient d'un `COALESCE` sur les
deux tables. Une tâche supprimée laisse la session en place avec un identifiant orphelin
et un libellé `null` — le temps a bien été passé, et le perdre serait pire que de
l'afficher sans nom.

`TimeEntryView.slotId` dit si un **créneau de planning** a déjà été tiré de cette session
(sous-requête sur `production_slots.time_entry_id`). Sa présence est ce qui interdit d'en
tirer un second : une même heure de montage ne doit apparaître qu'une fois dans le
planning, et surtout pas deux dans l'agenda, où rien ne permettrait de retirer le doublon.

`endedAt` à `null` signifie **le chronomètre tourne encore**. L'état vit en base et non
dans le navigateur : recharger la page, fermer l'onglet ou reprendre sur une autre
machine ne perd rien. `minutes` est **figé à l'arrêt** plutôt que recalculé à la
lecture — une saisie manuelle (« j'ai monté 2 h hier ») n'a pas d'horodatage fiable à
soustraire, et corriger une durée ne doit pas déplacer l'heure de début.

**Une seule session tourne à la fois** : `TrackTime.start()` arrête celle qui courait au
lieu de refuser. Un refus obligerait à retrouver soi-même la session oubliée de la
veille — qui aurait alors compté douze heures de montage. L'arrêt plancher à **1 minute** :
un démarrage suivi d'un arrêt immédiat laisserait sinon une ligne à zéro.

Le jour de rattachement est celui du **début** (`entry.date`) : une session commencée à
23 h 40 appartient à la soirée où on s'y est mis.

`entryMinutes()` (dupliqué côté front) mesure une session en cours jusqu'à maintenant :
sinon le cumul de la semaine resterait figé pendant qu'on travaille.

### `stepTodo` — les tâches d'étape

Deux origines, **une seule façon de les cocher**.

| Table                    | Ce que c'est                                            |
| ------------------------ | ------------------------------------------------------- |
| `step_todos`             | Le **référentiel** : les tâches habituelles d'une étape |
| `production_todos`       | Les tâches **ponctuelles** d'une seule vidéo            |
| `production_todo_checks` | La coche. **La présence de la ligne vaut « fait »**     |

`production_todo_checks.todo_id` désigne l'une **ou** l'autre des deux tables : aucune
clé étrangère n'est possible, le nettoyage se fait à la suppression côté dépôt
(`deleteStepTodo` / `deleteProductionTodo` effacent leurs coches).

`TodoItem { id, stepId, label, origin: 'step' | 'production', checked, checkedAt, sortOrder }`
est la vue à plat, portée par `ProductionView.todos` — les pastilles affichent « 2/5 »
sur chaque carte de la file, et une requête par pastille ferait autant d'allers-retours
que d'étapes multipliées par le nombre de vidéos.

**La règle, en une phrase : une étape est cochée exactement quand toutes ses tâches le
sont.** Elle vit dans `ManageTodos` (jamais dans une route, jamais dans le front) :

- cocher la dernière tâche de « montage » coche « montage » ;
- en décocher une le décoche — symétrique, sinon on afficherait une étape terminée
  portant un reste à faire, et le pourcentage compterait deux fois le même travail ;
- **ajouter** une tâche ponctuelle à une étape close la **rouvre** ;
- `PUT /steps/:stepId` coche l'étape **et toutes ses tâches** — laisser des tâches
  ouvertes sous une étape terminée la rouvrirait à la resynchronisation suivante ;
- une étape **sans aucune tâche** échappe à la règle : elle se coche à la main, comme avant.

`seedDefaultStepTodos` pose 23 tâches de départ (identifiants fixes). **Elles ne sont
posées qu'à la création de la base**, comme les étapes, les catégories et les obligations
légales : une tâche supprimée ne revient plus jamais. Voir « Les référentiels ne se sèment
qu'une fois » dans les points d'attention.

### `recurringExpense` — les dépenses qui reviennent

`RecurringExpense { id, channelId, categoryId, label, amountCents, intervalMonths, dayOfMonth, startDate, endDate, notes, isActive }` — table `recurring_expenses`.

**La périodicité est un nombre de mois**, pas une énumération (migration 16) : 1 mensuel,
3 trimestriel, 6 semestriel, 12 annuel, 24 tous les deux ans. Ajouter « tous les deux
ans » à une liste fermée demandait une migration, et la suivante en aurait demandé une
autre ; toute périodicité exprimable en mois existe désormais sans rien toucher.
`INTERVAL_PRESETS` ne fait que proposer les cinq rythmes courants dans le formulaire — un
rythme hors liste reste valide et s'affiche (`intervalLabel`).

**`startDate` ancre le rythme** : une règle tous les 24 mois démarrée en mars 2026 tombe
en mars 2028. C'est pour ça que `monthOfYear` a disparu — il ne disait rien que la date de
début ne dise déjà.

Les colonnes `frequency` et `month_of_year` **existent encore en base mais ne sont plus
lues**. Les supprimer imposerait de recréer la table, donc un `DROP` — et avec
`PRAGMA foreign_keys = ON`, un `DROP` déclenche le `ON DELETE SET NULL` de
`expense_entries.recurring_id` et **détacherait toutes les occurrences déjà projetées**.
Une colonne morte coûte moins cher qu'un historique cassé ; le dépôt y écrit une valeur
de compatibilité pour satisfaire son `CHECK`.

Ce n'est **pas** une ligne de dépense, c'est une **règle qui en engendre**. Les
occurrences sont de vraies `expense_entries` reliées par `recurring_id` : rien dans les
cumuls, les graphiques ou les catégories n'a à connaître les récurrences.

`SyncRecurringExpenses.execute()` garde **douze mois d'échéances d'avance**
(`OCCURRENCES_HORIZON_MONTHS`), et au minimum la prochaine. Un horizon en **durée** et non
un nombre fixe d'occurrences : douze échéances d'un abonnement annuel projetaient douze
ans de dépenses imaginaires dans la comptabilité. `occurrencesToProject(intervalMonths)`
en tire le compte — 12 pour un mensuel, 1 pour un annuel ou un bisannuel. Il ne cherche
pas ce qui manque : il redemande celles de l'horizon et insère en ignorant les conflits
sur l'index unique `(recurring_id, date)` — la projection est donc **idempotente**. Elle repart du **début
du mois courant** et non d'aujourd'hui : l'échéance du 5 alors qu'on est le 12 fait
partie du mois qu'on est en train de lire.

Elle tourne au **démarrage**, et à **chaque écriture d'une règle** (`reproject`, qui
efface d'abord les occurrences du mois courant et des suivants).

Conséquence assumée : **supprimer à la main une occurrence future la fait revenir**. Pour
retirer une échéance pour de bon, on arrête la règle (`isActive: false`) ou on la borne
(`endDate`). `ExpensesPanel` le dit dans sa confirmation de suppression.

Supprimer la règle supprime ses occurrences **futures** et **détache** les passées
(`ON DELETE SET NULL`) : ce qui a été payé fait partie de la comptabilité, la projection non.

`dueDateIn()` ramène un 31 au dernier jour d'un mois plus court, comme `dueDateOf` du
module légal.

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

### `affiliatePlatform`

`AffiliatePlatform { id, name, description, url, imageUrl, color, notes, sortOrder, isArchived }` —
table `affiliate_platforms` (migration 15).

Amazon Partenaires, Awin, Effiliation… Elles répondent à **deux** questions posées à des
moments différents : _où_ est gérée l'affiliation d'une marque (le lien et les marques
couvertes) et _laquelle rapporte le plus_ (l'argent).

La seconde suppose de **rattacher les revenus** : `revenue_entries.platform_id`, posé
exactement comme `video_id`, alimenté par le champ « Plateforme » du formulaire de revenu.
Un revenu à `platform_id NULL` est le cas normal — tous les revenus ne viennent pas de
l'affiliation.

Le lien avec les marques est **N:N et facultatif des deux côtés** (`affiliate_platform_brands`,
la présence de la ligne vaut le lien) : une plateforme couvre plusieurs marques, une marque
peut être sur plusieurs plateformes, et beaucoup de plateformes n'en ont aucune de
renseignée. `brandIds` **remplace entièrement** la liste quand il est fourni — le
formulaire envoie l'état complet des cases cochées, et une fusion rendrait impossible le
retrait d'une marque.

`AffiliatePlatformView` porte `earnedCents` (**borné par la période**), `totalEarnedCents`
(**jamais borné**) et `entriesCount`. Les deux montants disent autre chose : « ce
trimestre » sert à comparer, « depuis toujours » à décider si le compte vaut encore la
peine d'être suivi.

Suppression : les liens vers les marques partent en cascade, les **revenus sont détachés**
(`ON DELETE SET NULL`). Supprimer une plateforme ne doit pas effacer les euros qu'elle a
rapportés — ils restent dans le chiffre d'affaires, sans rattachement.

### `idea`

`Idea { id, text, createdAt, updatedAt }` — table `ideas` (migration 7).

Volontairement pauvre : un texte, et rien d'autre. Lui donner une chaîne, une date ou un statut en ferait une production au rabais — or c'est justement l'absence de champs qui permet de noter une idée en trois secondes, et une idée qu'on ne note pas est une idée perdue. Le bouton « en faire une vidéo » la promeut en `Production` (son texte devient le titre de travail) et la retire du carnet. La promotion est faite **côté front en deux appels** : créer la production, puis supprimer l'idée — un endpoint dédié n'apporterait qu'une transaction sur deux écritures indépendantes, et l'idée ne doit disparaître que si la vidéo est réellement créée.

### `legal`

Le suivi administratif : la société, et une ligne par mois depuis sa création.

`Company { id, name, legalForm, siret, vatNumber, address, foundedOn, notes }` — table
`company`, **ligne unique** (`id = 'default'`, insérée par la migration). `foundedOn`
décide du **premier mois** du tableau ; sans elle, il retombe sur les 12 derniers mois.

`LegalObligation { id, label, dayOfMonth, notes, sortOrder, isArchived }` — table
`legal_obligations`, seedée **à la création de la base** par `seedLegalObligations` avec
`factures-affiliation`, `declaration-produits`, `urssaf` (jour 15), `des` (jour 15) —
identifiants fixes.
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

### `legalBookmark`

`LegalBookmark { id, label, url, description, imageUrl, color, sortOrder, isArchived }` —
table `legal_bookmarks` (migration 13).

Les liens qu'on rouvre chaque mois pour faire ses démarches : Urssaf, impôts, portail
bancaire, cabinet comptable. Ils vivent **dans la page et non dans les signets du
navigateur** parce qu'on les cherche exactement au moment de cocher une case — et parce
qu'un signet ne dit pas _à quoi il sert_, là où une description de deux lignes le rappelle
un an plus tard.

Une **ligne** et non une colonne, comme les obligations et les étapes de production :
en ajouter un ne demande aucune migration, et le référentiel se gère depuis
Paramètres → Société. `sortOrder` est **manuel** — l'outil ne déduit aucune priorité
entre le portail Urssaf et celui des impôts.

La vignette a **deux replis** (`faviconOf`, dupliqué côté front) : l'image saisie, sinon
le favicon du site cible (`https://host/favicon.ico`), sinon l'initiale sur `color` —
attribuée en rotation à la création, comme pour les chaînes et les marques. Le favicon
est demandé **au site lui-même et jamais à un service de vignettes tiers** : ce serait
envoyer à un inconnu la liste des sites administratifs consultés, pour une image de seize
pixels. Un site sur deux ne répond pas ; il retombe alors sur l'initiale, sans que
personne ait rien appris au passage.

Suppression **franche**, contrairement aux obligations qu'on archive : un lien ne porte
aucun historique ni aucune case cochée, il n'y a rien à préserver.

### `videoStatSnapshot`

Table `video_stat_snapshots` (migration 14) : un relevé daté des compteurs d'une vidéo,
clé `(video_id, date)`, écrit par `SqliteVideoRepository.upsertStats` à chaque collecte.

`videos` ne porte qu'un **cumul depuis la sortie**, écrasé à chaque passage : il dit
« cette vidéo a fait 40 000 vues », jamais « elle en a fait 800 le mois dernier ». Or
c'est cette seconde question qu'on pose devant un catalogue.

Même parti pris que `channel_snapshots` : une ligne CUMUL par jour, dont on prend la
**différence** entre deux dates pour obtenir un flux. `sumStatsOverRange(ids, range)`
renvoie, par vidéo, `dernier relevé ≤ to` moins `dernier relevé < from`. L'écart est
planché à zéro — YouTube révise ses chiffres à la baisse, et une période ne doit pas
afficher −12 vues.

**Une vidéo sans relevé antérieur à la période est absente du résultat**, et
`periodViews` vaut alors `null` (affiché « — », jamais « 0 ») : sur une vidéo sortie il y
a deux ans, afficher son cumul dans une colonne « sur la période » serait faux d'un
facteur cinquante.

Un seul relevé par jour, le dernier écrasant le précédent : la collecte tourne toutes les
heures, et douze lignes quotidiennes par vidéo ne diraient rien de plus.

**L'historique commence à la première collecte suivant la migration.** La colonne « Vues
(période) » n'apparaît donc pas tant qu'aucune ligne ne sait répondre — une colonne
entièrement remplie de « — » se lirait comme une panne.

### `planning` — poser le travail dans le temps qui reste

Trois tables, un moteur, et une règle de déplacement qui gouverne tout le reste.

`WorkHours { id, weekday, startTime, endTime }` — table `work_hours`. **0 = lundi**, même
convention que `bucketStart`. **Plusieurs lignes par jour** : une journée coupée par la
pause du midi est le cas normal, et une seule plage ferait poser un montage à 12 h 30. Un
jour sans aucune ligne n'est simplement pas travaillé — c'est ce qui remplace un
« actif oui/non » qui n'aurait rien dit de plus. L'écriture est un **remplacement total**
(`PUT`), comme `brandIds` : faire des différences ligne à ligne demanderait des
identifiants stables à un formulaire qui n'en a aucun besoin.

`PlanningSettings` — table `planning_settings`, **ligne unique** (`id = 'default'`), comme
`company`. Porte l'adresse Home Assistant, le jeton, le calendrier cible, les calendriers
à respecter, et la forme des créneaux (`minBlockMinutes`, `maxBlockMinutes`,
`breakMinutes`, `slotGranularityMinutes`, `horizonDays`, `pushToCalendar`). Le **jeton ne
sort jamais de l'API** : `PlanningSettingsView` le remplace par `hasToken`, et seul
`SqlitePlanningSettingsRepository.token()` le lit — même règle que `refreshToken` sur les
chaînes, pour la même raison.

`PlanningItem { id, productionId, stepId, todoId, label, plannedMinutes, sequence, status }`
— table `planning_items`. **La pile de ce qui est en cours.** Ajouter une vidéo au planning
en cochant « Écriture » y dépose **une ligne par tâche non cochée** de cette étape — c'est
ce qui donne les cinq créneaux attendus plutôt qu'un bloc opaque de trois heures. Une
étape **sans aucune tâche** entre entière : il n'y a rien de plus fin à viser. `todo_id`
désigne `step_todos` **ou** `production_todos` — aucune clé étrangère n'est possible,
exactement comme `production_todo_checks`. Index unique sur
`(production_id, COALESCE(step_id,''), COALESCE(todo_id,''))` : remettre la même tâche
dans la pile **la rouvre** au lieu d'échouer, parce que c'est le geste normal.

`sequence` est l'ordre voulu et il est **strictement respecté** : la tâche n+1 ne commence
pas avant que la n ait reçu toutes ses minutes. Caler le montage avant le tournage
remplirait joliment un agenda sans rien permettre de faire.

**Les durées.** `production_steps.default_minutes`, `step_todos.default_minutes` et
`production_todos.default_minutes` sont **nullables et non à zéro** : « je ne sais pas » et
« ça ne prend pas de temps » sont deux réponses différentes, et seule la première fait
retomber la tâche sur la durée de son étape, puis sur `FALLBACK_MINUTES` (60).

#### La règle de déplacement

**Il n'y a pas de colonne `status` sur `production_slots`.** `origin`
(`manual` | `planner`) dit qui a posé le créneau, et le `done` existant dit s'il est
approuvé. Un troisième champ redirait la même chose et finirait par la contredire —
« suggéré » n'est rien d'autre que `planner` et pas encore `done`.

Il en découle une règle unique, écrite une seule fois dans
`SqliteProductionSlotRepository.clearSuggestions` : **le moteur ne réécrit que
`origin = 'planner' AND done = 0`**. Un créneau approuvé raconte du temps déjà passé ; un
créneau posé à la main a été voulu là où il est. Ni l'un ni l'autre ne bouge jamais.

Déplacer un créneau au doigt le fait passer en `manual` — c'est
`updateProductionSlotSchema` qui autorise ce champ, **et lui seul** : sans lui, zod
l'aurait silencieusement filtré et le glisser-déposer aurait été annulé au replacement
suivant.

#### Le moteur (`domain/planning/services/scheduler.ts`)

Fonction **pure**, sans accès aux dépôts : plages travaillables, occupations, tâches
ordonnées → blocs. C'est ce qui permet de la rejouer autant qu'on veut (« réorganiser ce
jour », « repositionner tout ») sans dépendre de ce qui est déjà en base.

Les **occupations** réunissent les événements de l'agenda et les créneaux immobiles
(approuvés ou manuels). Une tâche plus longue que `maxBlockMinutes` est **découpée en
plusieurs séances** ; le reliquat final est posé même sous `minBlockMinutes`, sinon les
dernières minutes ne trouveraient jamais leur place et la ligne resterait ouverte à vie.

`notBeforeMinutes` vient **du navigateur**, jamais de l'horloge du serveur : l'API tourne
en UTC dans un conteneur, et s'y fier proposerait un créneau à 9 h alors qu'il est midi.
Même raison pour `from`, envoyé par le front (`localToday()`).

#### Le replan est un effacement, pas un ajustement

`ManagePlanning.replan()` **efface les suggestions déplaçables puis repose tout**.
Chercher quoi bouger reviendrait à réimplémenter le moteur à l'envers, et un placement à
moitié appliqué laisserait deux créneaux au même endroit — exactement ce que le replan
doit corriger.

L'ordre des deux opérations est un piège à lui seul : **le nettoyage vient avant le calcul
du reste à faire.** Ce qui survit à l'effacement — les créneaux manuels, et ceux des autres
jours quand on ne réorganise qu'une colonne — couvre déjà du travail ; le compter après les
avoir effacés est la seule façon de ne pas poser deux fois les mêmes heures. D'où
`minutes = plannedMinutes - approvedMinutes - scheduledMinutes`.

Un replan **complet** efface aussi les suggestions **passées jamais approuvées**
(`clearSuggestions(null, to)`) : elles n'ont rien raconté, et les laisser traîner ferait
croire que ce travail est déjà casé.

#### Approuver n'est pas terminer

C'est toute la mécanique de `ManagePlanning.approve()`, et elle fait **quatre** choses pour
un clic — d'où le use case propriétaire, les routes ne touchant jamais la pile :

1. une `TimeEntry` est créée : c'est elle qui fait monter le compteur de la vidéo ;
2. le créneau est **redimensionné sur le temps réellement passé** (approuver 30 min d'un
   bloc de 45 laisse un bloc de 30), puis figé — la grille se lit comme un journal de ce
   qui a eu lieu, et ça évite de stocker la durée une seconde fois ;
3. il est publié dans l'agenda, **si** la connexion existe. L'échec est **avalé** : le
   temps passé est déjà enregistré, l'événement est du confort ;
4. `finished` décide de la suite. **Oui** : la ligne quitte la pile et la tâche est cochée.
   **Non** : `plannedMinutes` est recalé sur `approvedMinutes + durée prévue du créneau`,
   et le replan repose un créneau de cette durée. Répondre à la place de l'utilisateur
   ferait disparaître de la pile un travail à moitié fait, ou l'y laisserait pour toujours.

`unapprove` retire la session et rend le créneau mobile. La durée d'origine, elle, ne
revient pas : l'approbation l'a recalée sur le temps vécu, et l'estimation d'avant n'est
écrite nulle part. `calendarUid` est **conservé** — l'événement est toujours dans l'agenda
et rien ne permet de l'en retirer ; le garder évite d'en créer un second.

#### Home Assistant : ce qu'on peut, et ce qu'on ne peut pas

`infrastructure/planning/api/HomeAssistantClient.ts`. L'API REST permet de **lister** les
calendriers (`GET /api/calendars`), de **lire** leurs événements
(`GET /api/calendars/<entity>?start=&end=`) et d'en **créer** un
(`POST /api/services/calendar/create_event`). Elle ne permet **ni de modifier ni de
supprimer** : le core n'expose aucun service pour ça.

**C'est cette limite qui décide de toute l'architecture du planning.** Les suggestions
vivent dans l'outil, où elles se déplacent et se suppriment librement ; **seul un créneau
approuvé part dans l'agenda**, précisément parce qu'il ne bougera plus. Pousser les
suggestions laisserait au premier replan une traînée d'événements fantômes impossibles à
retirer.

Les heures sont lues **textuellement** dans la chaîne renvoyée
(`2026-09-04T14:00:00+02:00` donne 14 h 00) et écrites **sans décalage**
(`2026-09-04 14:00:00`, que Home Assistant interprète dans son propre fuseau). Passer par
un `Date` recomposerait l'heure dans le fuseau du serveur — UTC — et décalerait la journée
de deux heures en été.

Les événements de **journée entière** sont affichés mais **n'occupent rien** : « congés »
couvrirait 24 h et rendrait la journée impossible, alors qu'ils servent surtout à
étiqueter.

Une lecture d'agenda qui échoue **ne fait pas échouer le planning** : la grille sort sans
occupations externes, avec `calendarError` renseigné. Une page vide dirait moins qu'une
page qui prévient qu'elle est incomplète.

### `instagram` — le rythme de publication

Un domaine **à part** et non une `channel` de plus. Une chaîne YouTube et un compte
Instagram ne mesurent pas les mêmes choses : `daily_metrics` porte des minutes vues, une
durée moyenne de visionnage et des revenus AdSense, dont aucun n'a de sens ici ; `videos`
porte des compteurs YouTube. Les mélanger laisserait la moitié des colonnes à `NULL` des
deux côtés, et le premier calcul de moyenne serait faux. Deux écrans, deux collectes, et
l'argent continue de se rattacher aux chaînes.

#### La contrainte qui décide de tout : les stories ne vivent que 24 heures

L'API n'expose les stories que pendant leur fenêtre de vie — **ni archivées, ni à la une,
ni par aucun autre point d'entrée**. « Combien de stories ai-je publiées ce mois-ci » n'est
donc pas une question rétroactive : c'est une question à laquelle on ne peut répondre que
si on a **archivé au fil de l'eau**. Trois conséquences, toutes assumées :

- **L'historique commence à la première collecte**, exactement comme
  `video_stat_snapshots`. `InstagramOverview.firstStoryDate` porte cet aveu, et l'écran
  l'affiche : avant cette date, un zéro veut dire « rien collecté », pas « rien publié ».
- **Une journée sans collecte est perdue pour de bon.** Le cron horaire couvre largement
  la fenêtre, mais un serveur arrêté 24 h laisse un trou définitif — d'où la priorité
  d'Instagram dans le scheduler.
- **Un jeton expiré fait perdre des stories**, pas seulement des chiffres. C'est ce qui
  justifie l'alerte en tête d'écran dès `tokenDaysLeft <= 10`.

`ig_stories.insights_at` à `null` distingue « pas encore mesurée » de « zéro vue », et il
reste à `null` **pour de bon** sur une story vue par **moins de cinq comptes** : Meta
refuse alors toute statistique. L'écran affiche « — », jamais 0.

#### Ce que Meta rend, et sous quelle forme

| Donnée                                                                  | Endpoint                                           | Forme                     | Rétention |
| ----------------------------------------------------------------------- | -------------------------------------------------- | ------------------------- | --------- |
| Profil (abonnés, publications)                                          | `/{ig-user-id}`                                    | valeurs courantes         | —         |
| `reach`                                                                 | `/{ig-user-id}/insights` `metric_type=time_series` | **série quotidienne**     | 90 j      |
| `views`, `total_interactions`, `accounts_engaged`, `profile_links_taps` | idem, `metric_type=total_value`                    | **un total par requête**  | 90 j      |
| Stories                                                                 | `/{ig-user-id}/stories`                            | les **actives** seulement | 24 h      |
| Publications                                                            | `/{ig-user-id}/media` + `/{id}/insights`           | liste + compteurs         | 2 ans     |

**`reach` est la seule métrique de compte disponible en série.** Tout le reste est un
`total_value` qu'il faut demander **jour par jour** — c'est ce qui borne `BACKFILL_DAYS`
à 30 : remonter trois mois coûterait près de quatre cents appels pour un seul compte.

**`impressions` est mort** (avril 2025), remplacé partout par `views` ; `profile_views` a
suivi. Demander une métrique dépréciée fait échouer **toute** la requête, pas seulement le
champ — d'où le repli métrique par métrique de `fetchDayTotals`, même parti pris que
`YouTubeAnalyticsClient.fetchDailyMetrics`.

#### Les quatre étapes de la collecte, dans cet ordre

`CollectInstagram.collectOne()` : **stories**, profil, compteurs quotidiens, publications.
L'ordre n'est pas indifférent — les stories passent en premier parce que ce sont les seules
données qu'aucun rattrapage ne retrouvera jamais, et un quota épuisé en fin de parcours ne
doit pas les faire manquer. Chaque étape est **isolée** : son échec est journalisé et
n'interrompt pas les autres.

Une story déjà mesurée n'est **pas remesurée** : ses chiffres sont figés et chaque appel
coûte du quota. `upsertStory` fait `DO NOTHING` — une réponse partielle ne doit jamais
remplacer par du vide ce qu'une collecte complète avait ramené. Même raison pour le
`COALESCE(excluded.x, x)` de `upsertDailyMetric`.

#### FLUX et CUMUL, comme partout

`stories`, `posts`, `reach`, `views` se somment dans le bucket **et** entre comptes ;
`followers` non — c'est un cumul dont on prend la dernière valeur du bucket, reportée sur
les périodes sans relevé (`GetInstagramOverview.buildSeries`, même mécanique que
`applyCumulativeTotals`). Le gain d'abonnés se mesure contre `findSnapshotBefore(from)` :
sans point de départ antérieur, 1 200 abonnés pourrait être un gain de 10 comme de 400.

`storiesPerDay` rapporte au **nombre de jours de la période**, pas aux jours de
publication : « 2,4 stories par jour » se compare d'un mois à l'autre, « 4 stories les
jours où j'en poste » ne dit rien du rythme. `activeDays` reste exposé à côté pour la
seconde lecture.

#### Le jeton

Meta ne délivre **pas** de jeton perpétuel : un jeton longue durée vit 60 jours.
`ig_accounts.token_expires_at` existe pour que l'échéance soit visible avant la panne, et
`POST /accounts/:id/refresh-token` l'échange contre un neuf — ce qui demande `META_APP_ID`
et `META_APP_SECRET`. Sans ces deux variables tout fonctionne, mais le jeton se régénère à
la main tous les deux mois.

Comme le refresh token des chaînes, **il ne sort jamais de l'API** : `findAll` renvoie des
`InstagramAccountView` où il est remplacé par `hasToken`, et les routes d'écriture
relisent la vue plutôt que de renvoyer l'entité qu'elles viennent d'écrire.

### `analytics`

`GetAnalytics.execute(query)` renvoie `{ query, series, totals, byCategory, byExpenseCategory, byChannel, videos, videoPerformance, previousTotals }`. `byCategory` = répartition des revenus (AdSense inclus), `byExpenseCategory` = celle des dépenses. `previousTotals` couvre la période précédente de même longueur, pour les variations en %.

`videos` liste les sorties de la période sous forme de `VideoMarker { id, channelId, channelName, channelColor, title, thumbnailUrl, date, bucket }`. **`bucket` est calculé côté API** (`bucketStart`) et tombe exactement sur un `series[].date` : la règle de découpage (semaine ISO commençant le lundi) n'existe qu'à un seul endroit.

`totals` porte aussi deux compteurs de cardinalité, `videosPublished` et `inKindEntries` (nombre de produits reçus, pas leur montant). Ils sont posés par `applyCounts()` après `sumTotals()` : les compter bucket par bucket les ferait doubler dès qu'une entrée tombe à cheval sur un découpage.

`videoPerformance` est une ligne par vidéo sortie dans la période : les compteurs collectés (`views`, `watchHours`, `subscribersGained`, `hasStats`) et l'argent, décomposé en `adsenseCents` / `manualCashCents` / `inKindCents` / `expenseCents` — les mêmes noms que `MoneyParts`, pour que le front y applique `moneyValue` comme à n'importe quel point de série. **L'argent rattaché ignore les bornes de la période** (`sumByVideo` n'a pas de filtre de date) : une sponso encaissée deux mois après la sortie appartient quand même à la vidéo qui l'a rapportée. C'est pour ça que ces montants ne se recoupent pas avec `totals`.

Chaque `TimeSeriesPoint` porte aussi `revenueByCategory` et `expenseByCategory` (`Record<categoryId, cents>`, les zéros omis) : c'est ce qui permet au `MoneyChart` d'empiler une barre par catégorie avec **sa** couleur. Deux dictionnaires séparés, sinon une catégorie `both` mélangerait ce qui rentre et ce qui sort le même jour.

## Endpoints API

Base : `http://localhost:3001`. En prod, nginx proxifie `/api/` vers le conteneur API.

| Méthode  | Route                                               | Rôle                                                                                                                                                                                                  |
| -------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/health`                                           | Sonde du conteneur                                                                                                                                                                                    |
| `GET`    | `/api/analytics`                                    | Séries + cumuls. Params : `from`, `to`, `granularity` (`day\|week\|month`), `channelIds` (CSV, vide = cumulé), `includeUnassigned`                                                                    |
| `POST`   | `/api/analytics/collect`                            | Collecte immédiate de toutes les chaînes                                                                                                                                                              |
| `GET`    | `/api/channels`                                     | Liste + `latestSnapshot` + `lastMetricDate`. Param `includeArchived`                                                                                                                                  |
| `POST`   | `/api/channels`                                     | Créer                                                                                                                                                                                                 |
| `POST`   | `/api/channels/resolve`                             | `{ query }` (@handle / URL / UC…) → identifiant + stats                                                                                                                                               |
| `PATCH`  | `/api/channels/:id`                                 | Modifier (`refreshToken: ""` efface, absent = conserve)                                                                                                                                               |
| `DELETE` | `/api/channels/:id`                                 | Supprimer                                                                                                                                                                                             |
| `POST`   | `/api/channels/:id/collect`                         | Collecter cette chaîne                                                                                                                                                                                |
| `PUT`    | `/api/channels/:id/metrics`                         | Saisie manuelle d'une journée (`source = manual`)                                                                                                                                                     |
| `DELETE` | `/api/channels/:id/metrics/:date`                   | Supprimer une journée                                                                                                                                                                                 |
| `PUT`    | `/api/channels/:id/snapshots`                       | Saisie manuelle d'un total d'abonnés                                                                                                                                                                  |
| `GET`    | `/api/videos`                                       | Sorties de vidéo. Params `from`, `to`, `channelIds`, `limit` (200 par défaut). Période **facultative** : le sélecteur de rattachement doit proposer des vidéos plus anciennes que la période affichée |
| `GET`    | `/api/categories`                                   | Params `includeArchived`, `scope` (`revenue                                                                                                                                                           | expense | both`;`both` répond toujours) |
| `POST`   | `/api/categories`                                   | Créer (`scope` défaut `revenue`)                                                                                                                                                                      |
| `PATCH`  | `/api/categories/:id`                               | Modifier / archiver                                                                                                                                                                                   |
| `DELETE` | `/api/categories/:id`                               | Refusé si `isAuto` ou si des revenus/dépenses y sont rattachés                                                                                                                                        |
| `GET`    | `/api/revenues`                                     | Params `from`, `to`, `channelIds`                                                                                                                                                                     |
| `POST`   | `/api/revenues`                                     | `amount` **en euros**, `videoId` facultatif. Refusé sur une catégorie `isAuto` ou `scope: expense`                                                                                                    |
| `PATCH`  | `/api/revenues/:id`                                 | Modifier                                                                                                                                                                                              |
| `DELETE` | `/api/revenues/:id`                                 | Supprimer                                                                                                                                                                                             |
| `GET`    | `/api/expenses`                                     | Params `from`, `to`, `channelIds`                                                                                                                                                                     |
| `POST`   | `/api/expenses`                                     | `amount` **en euros**, positif, `videoId` facultatif. `categoryId` obligatoire, refusé sur `scope: revenue`                                                                                           |
| `PATCH`  | `/api/expenses/:id`                                 | Modifier                                                                                                                                                                                              |
| `DELETE` | `/api/expenses/:id`                                 | Supprimer                                                                                                                                                                                             |
| `GET`    | `/api/brands`                                       | Param `includeArchived`                                                                                                                                                                               |
| `GET`    | `/api/brands/stats`                                 | Classements du dashboard. Params `from`, `to`, `channelIds`. **Déclaré avant `/:id`**                                                                                                                 |
| `POST`   | `/api/brands`                                       | Créer                                                                                                                                                                                                 |
| `PATCH`  | `/api/brands/:id`                                   | Modifier / archiver                                                                                                                                                                                   |
| `DELETE` | `/api/brands/:id`                                   | Refusé en 409 si des produits ou sponsos y sont rattachés                                                                                                                                             |
| `GET`    | `/api/productions`                                  | Params `statuses` (CSV), `channelIds`, `from`/`to` (sur `plannedDate`), `search`                                                                                                                      |
| `GET`    | `/api/productions/overview`                         | File d'attente + alertes + créneaux + charge de la semaine. **Déclaré avant `/:id`**                                                                                                                  |
| `GET`    | `/api/productions/:id`                              | Une production (`ProductionView`)                                                                                                                                                                     |
| `POST`   | `/api/productions`                                  | Créer (entre en **fin** de file)                                                                                                                                                                      |
| `POST`   | `/api/productions/reorder`                          | `{ ids }` → l'ordre manuel de la file, le rang est l'index                                                                                                                                            |
| `PATCH`  | `/api/productions/:id`                              | Modifier (dont `script`)                                                                                                                                                                              |
| `DELETE` | `/api/productions/:id`                              | Supprimer ; produits et sponsos sont **détachés**, pas supprimés                                                                                                                                      |
| `POST`   | `/api/productions/:id/publish`                      | `{ videoId }` → rattache la sortie, coche la publication, passe en `done`                                                                                                                             |
| `PUT`    | `/api/productions/:id/steps/:stepId`                | Cocher une étape (idempotent)                                                                                                                                                                         |
| `DELETE` | `/api/productions/:id/steps/:stepId`                | Décocher                                                                                                                                                                                              |
| `GET`    | `/api/production-steps`                             | Référentiel des étapes. Param `includeArchived`                                                                                                                                                       |
| `POST`   | `/api/production-steps`                             | Créer                                                                                                                                                                                                 |
| `PATCH`  | `/api/production-steps/:id`                         | Modifier / archiver / réordonner                                                                                                                                                                      |
| `DELETE` | `/api/production-steps/:id`                         | Supprimer (les cases cochées partent en cascade)                                                                                                                                                      |
| `GET`    | `/api/production-slots`                             | Params `productionIds`, `from`, `to`, `includeDone`                                                                                                                                                   |
| `POST`   | `/api/production-slots`                             | `productionId` dans le corps                                                                                                                                                                          |
| `PATCH`  | `/api/production-slots/:id`                         | Modifier / marquer fait                                                                                                                                                                               |
| `DELETE` | `/api/production-slots/:id`                         | Supprimer                                                                                                                                                                                             |
| `GET`    | `/api/products`                                     | Params `statuses`, `brandIds`, `productionIds`, `channelIds`                                                                                                                                          |
| `POST`   | `/api/products`                                     | `value` **en euros**. `received` déclenche le revenu en nature                                                                                                                                        |
| `PATCH`  | `/api/products/:id`                                 | Modifier (re-synchronise le revenu)                                                                                                                                                                   |
| `DELETE` | `/api/products/:id`                                 | Supprimer (le revenu lié part avec)                                                                                                                                                                   |
| `GET`    | `/api/sponsorships`                                 | Mêmes params que les produits                                                                                                                                                                         |
| `POST`   | `/api/sponsorships`                                 | `amount` **en euros**. `paid` déclenche le revenu cash                                                                                                                                                |
| `PATCH`  | `/api/sponsorships/:id`                             | Modifier (re-synchronise le revenu)                                                                                                                                                                   |
| `DELETE` | `/api/sponsorships/:id`                             | Supprimer (le revenu lié part avec)                                                                                                                                                                   |
| `POST`   | `/api/sponsorships/:id/requirements`                | Ajouter un plan à filmer (entre en fin de liste)                                                                                                                                                      |
| `PATCH`  | `/api/sponsorships/:id/requirements/:requirementId` | Cocher / renommer / réordonner un plan                                                                                                                                                                |
| `DELETE` | `/api/sponsorships/:id/requirements/:requirementId` | Retirer un plan                                                                                                                                                                                       |
| `GET`    | `/api/legal/overview`                               | Société, obligations, tableau mensuel et alertes en une requête                                                                                                                                       |
| `GET`    | `/api/legal/company`                                | Fiche société (ligne unique)                                                                                                                                                                          |
| `PATCH`  | `/api/legal/company`                                | Modifier. `foundedOn` décide du premier mois du tableau                                                                                                                                               |
| `GET`    | `/api/legal/obligations`                            | Référentiel des obligations. Param `includeArchived`                                                                                                                                                  |
| `POST`   | `/api/legal/obligations`                            | Créer                                                                                                                                                                                                 |
| `PATCH`  | `/api/legal/obligations/:id`                        | Modifier / archiver / réordonner                                                                                                                                                                      |
| `DELETE` | `/api/legal/obligations/:id`                        | Supprimer (les cases cochées de tous les mois partent en cascade)                                                                                                                                     |
| `PUT`    | `/api/legal/checks/:obligationId/:month`            | Cocher un mois (`AAAA-MM`, 422 sinon). Idempotent                                                                                                                                                     |
| `DELETE` | `/api/legal/checks/:obligationId/:month`            | Décocher                                                                                                                                                                                              |
| `GET`    | `/api/affiliate-platforms`                          | Plateformes d'affiliation, avec marques et gains. Params `includeArchived`, `from`, `to`                                                                                                              |
| `POST`   | `/api/affiliate-platforms`                          | Créer. `brandIds` remplace entièrement la liste des marques                                                                                                                                           |
| `PATCH`  | `/api/affiliate-platforms/:id`                      | Modifier / archiver. `brandIds` absent = marques inchangées                                                                                                                                           |
| `DELETE` | `/api/affiliate-platforms/:id`                      | Supprimer ; les revenus rattachés sont **détachés**                                                                                                                                                   |
| `GET`    | `/api/legal/bookmarks`                              | Liens utiles de l'écran Légal. Param `includeArchived`                                                                                                                                                |
| `POST`   | `/api/legal/bookmarks`                              | Créer. `url` doit être **absolue** (le front complète le `https://` manquant)                                                                                                                         |
| `PATCH`  | `/api/legal/bookmarks/:id`                          | Modifier / réordonner                                                                                                                                                                                 |
| `DELETE` | `/api/legal/bookmarks/:id`                          | Supprimer (pas d'archivage : rien n'en dépend)                                                                                                                                                        |
| `GET`    | `/api/planning/board`                               | Grille, occupations et pile de travail en une requête. Params `from`, `to` (obligatoires)                                                                                                             |
| `GET`    | `/api/planning/settings`                            | Réglages. **Le jeton n'en sort jamais**, remplacé par `hasToken`                                                                                                                                      |
| `PATCH`  | `/api/planning/settings`                            | Modifier. `calendarToken: ""` efface, absent conserve                                                                                                                                                 |
| `GET`    | `/api/planning/calendars`                           | Entités calendrier de l'instance. 400 tant qu'aucune connexion n'est configurée                                                                                                                       |
| `GET`    | `/api/planning/work-hours`                          | Plages travaillables de la semaine type                                                                                                                                                               |
| `PUT`    | `/api/planning/work-hours`                          | **Remplacement total** de la grille (`{ ranges }`)                                                                                                                                                    |
| `GET`    | `/api/planning/items`                               | La pile de ce qui est en cours                                                                                                                                                                        |
| `POST`   | `/api/planning/items`                               | Ajouter une vidéo : `{ productionId, stepIds, todoIds, from?, nowMinutes? }`. Replanifie dans la foulée                                                                                               |
| `POST`   | `/api/planning/items/reorder`                       | `{ ids }` → l'ordre de placement, le rang est l'index                                                                                                                                                 |
| `DELETE` | `/api/planning/items/:id`                           | Retirer de la pile. Les créneaux déjà posés **restent**                                                                                                                                               |
| `POST`   | `/api/planning/replan`                              | Repositionner. `onlyDate` = une seule colonne, sinon tout l'horizon                                                                                                                                   |
| `POST`   | `/api/planning/slots/:id/approve`                   | `{ finished }` **obligatoire**. Crée la session, fige et redimensionne le créneau, publie dans l'agenda ; renvoie `{ next }`, le créneau reposé si le travail continue                                |
| `POST`   | `/api/planning/slots/:id/unapprove`                 | Défaire : la session part, le créneau redevient mobile                                                                                                                                                |
| `POST`   | `/api/planning/time-entries/:id/slot`               | Transforme une session de travail en créneau approuvé. `{ date, startTime }` **fournis par le client** (le serveur est en UTC). 409 si la session tourne encore ou a déjà son créneau                 |
| `GET`    | `/api/instagram/overview`                           | Séries, totaux, stories et publications. Params `from`, `to` (obligatoires), `granularity`, `accountIds`                                                                                              |
| `GET`    | `/api/instagram/accounts`                           | Comptes suivis. **Le jeton n'en sort jamais**, remplacé par `hasToken` et `tokenDaysLeft`                                                                                                             |
| `POST`   | `/api/instagram/accounts`                           | Connecter un compte. 409 si l'`igUserId` est déjà suivi                                                                                                                                               |
| `PATCH`  | `/api/instagram/accounts/:id`                       | Modifier / archiver. `accessToken: ""` efface, absent conserve                                                                                                                                        |
| `DELETE` | `/api/instagram/accounts/:id`                       | Supprimer **et tout l'historique** (cascade). Irrécupérable : les stories ne se recollectent pas                                                                                                      |
| `POST`   | `/api/instagram/collect`                            | Collecte immédiate de tous les comptes                                                                                                                                                                |
| `POST`   | `/api/instagram/accounts/:id/collect`               | Collecter ce compte                                                                                                                                                                                   |
| `POST`   | `/api/instagram/accounts/:id/refresh-token`         | Échange le jeton contre un neuf (60 j de plus). Demande `META_APP_ID` / `META_APP_SECRET`                                                                                                             |

Erreurs : `{ error, code, details? }`. `422` pour une validation zod (avec `details[].field`), `409` pour un conflit métier, `502` pour une erreur YouTube.

## Routes front

| Route               | Page                   | Contenu                                                                                                                                               |
| ------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                 | `DashboardPage`        | 11 cartes de stats, **dernière sortie en pleine largeur**, alertes (production + légal), puis **les deux graphiques seulement** (argent, audience)    |
| `/contenu`          | `ContentPage`          | 5 cartes d'audience, graphique d'audience, classement + tableau de performance par vidéo — que de la mesure, sur la période                           |
| `/instagram`        | `InstagramPage`        | 6 cartes, graphique à 3 onglets, puis calendrier des stories / tableau des publications                                                               |
| `/planning`         | `PlanningPage`         | Grille horaire jour/semaine, pile de travail à droite, bouton « Ajouter une vidéo »                                                                   |
| `/production`       | `ProductionPage`       | Alertes, **planning en permanence**, puis 2 onglets : file d'attente (créneaux et carnet d'idées à droite) / terminées                                |
| `/production/:id`   | `ProductionDetailPage` | En-tête (statut, étapes, progression) + onglets Script / Créneaux / Produits & sponsos / Notes                                                        |
| `/partenariats`     | `PartnersPage`         | 4 cartes de pipeline (`PartnerStatCards`), puis trois onglets Produits, Sponsors et **Plateformes** (`?onglet=`). Bouton **Script** par sponso        |
| `/chiffre-affaires` | `TurnoverPage`         | 4 cartes d'argent, puis 3 onglets (`?onglet=`) : Synthèse (graphique + répartitions + classements), Revenus, Dépenses                                 |
| `/legal`            | `LegalPage`            | Fiche société, **liens utiles**, avancement, alertes, tableau mensuel à cocher — un onglet par année (`?annee=`)                                      |
| `/parametres`       | `SettingsPage`         | **Tous les réglages**, en onglets (`?onglet=`) : Application, Chaînes, **Instagram**, Catégories, Abonnements, Marques, Étapes, **Planning**, Société |

`/chaines`, `/categories`, `/marques`, `/etapes`, `/societe` et `/abonnements`
**redirigent** vers `/parametres` sur le bon onglet : c'étaient six entrées d'un menu
déroulant, donc six adresses à connaître et autant d'allers-retours pour comparer deux
référentiels. Les pages existent toujours comme composants, montées dans les onglets —
leur titre est passé en `<h2>`, `SettingsPage` porte le `<h1>`.

`/revenus`, `/depenses` et `/taxes` **redirigent** vers `/chiffre-affaires` sur le bon
onglet : ce sont les deux moitiés de la même soustraction, et elles se consultent l'une
après l'autre. Les tables vivent désormais dans `components/money/RevenuesPanel.tsx` et
`ExpensesPanel.tsx` — ce sont les anciennes pages, déplacées telles quelles.

`/horaires` **redirige** vers `/parametres?onglet=planning`.

`PlanningPage` porte **deux vues seulement, jour et semaine, et pas de vue mois** : un
créneau de montage se décide à l'heure près, et une grille mensuelle ne montre plus les
heures. Ce qui se regarde au mois, c'est la sortie des vidéos — et le Gantt de
`/production` le dit déjà.

`PlanningGrid` est **écrite à la main**, sans bibliothèque de calendrier ni de
glisser-déposer : le besoin tient en une conversion « pixels ↔ minutes » et trois
écouteurs de pointeur, là où une dépendance imposerait son modèle d'événement, son thème et
sa gestion du fuseau — même parti pris que le Gantt, les confettis et le service worker. Le
pointeur est **capturé** sur le bloc, sans quoi sortir de sa colonne pendant le geste
l'interromprait — or c'est exactement ce qu'on fait pour changer de jour. Le déplacement
est arrondi au quart d'heure : on ne cale pas un créneau à la minute près.

Les bornes verticales viennent de `dayBounds` : la grille s'ouvre sur la première plage
travaillable et se ferme sur la dernière, **élargies par ce qui déborde** — un créneau
déplacé à la main hors des horaires doit rester visible, sinon il disparaîtrait sans
prévenir.

`AddToPlanDialog` se lit en deux temps : la vidéo (prise dans la file d'attente), puis les
étapes et leurs tâches. Cocher une étape coche ses tâches ; en décocher une laisse l'étape
partiellement retenue — c'est le cas normal (« je fais l'écriture, mais pas le repérage »).
Ce qui est **déjà coché sur la vidéo** est grisé et non sélectionnable. Le total attendu
s'affiche en continu, pour qu'on sache qu'on vient de demander onze heures **avant** de
cliquer.

`ROUTES_WITHOUT_FILTERS` inclut `/planning` : la période s'y choisit dans l'écran lui-même,
et une seconde barre de dates au-dessus dirait autre chose que la grille.

`AppLayout` porte la navigation dans une **barre latérale à gauche**, pas dans une rangée
d'onglets horizontale. Trois raisons : la liste des écrans peut grandir sans se disputer
la largeur avec la barre de filtres ; l'écran actif se repère à sa position plutôt qu'à
sa couleur ; et sur mobile la même barre devient un **tiroir** (bouton hamburger dans
l'en-tête, overlay + `Échap` par clic sur le fond), au lieu d'une rangée qui défile
horizontalement.

**Repliée, la barre ne montre que les icônes** (`SIDEBAR_CLOSED` 3,75 rem contre
`SIDEBAR_OPEN` 15 rem), le libellé revenant en infobulle. L'état est une préférence
persistée (`usePreferences`), pas un état d'écran : on choisit une fois. Le contenu suit
par un `lg:pl-[var(--sidebar-width)]`.

**Paramètres et thème sont en bas**, séparés par un filet : on n'y va pas dans le fil du
travail, et les mettre en tête ferait descendre les écrans qu'on ouvre chaque jour. Le
repli ne s'affiche qu'en colonne fixe (`lg`) — dans un tiroir il n'aurait pas de sens.

Le tiroir mobile se referme à la navigation, **dérivé pendant le rendu** (comparaison du
`pathname` précédent) et non dans un `useEffect` : c'est le pattern des formulaires du
projet, et la règle ESLint `react-hooks/set-state-in-effect` refuse l'autre.

La largeur du contenu reste fixée par `CONTAINER` (`max-w-[1800px]`).

Le **bandeau du chronomètre** (`RunningTimerBar`) vit **dans l'en-tête collant**, sous la
barre de filtres : on démarre une session sur la production puis on part consulter ses
revenus — et c'est là qu'on oublie de l'arrêter. L'y poser plutôt que de lui donner son
propre `sticky` à décalage fixe évite de le désaligner dès que la barre de filtres change
de hauteur. La durée est **recalculée en local à la seconde** depuis l'heure de début ; le
serveur n'est interrogé qu'une fois par minute (`useRunningTimer`), assez pour voir un
arrêt fait depuis un autre onglet sans marteler l'API pour animer un compteur.

La `FiltersBar` vit **dans l'en-tête collant**, sans trait de séparation : elle en fait
partie. Elle n'apparaît pas sur les routes de `ROUTES_WITHOUT_FILTERS` (`/parametres`,
`/production`, `/partenariats`, `/legal`). Elle tient désormais sur **une seule ligne** —
elle en occupait deux — grâce à deux déclencheurs compacts :

- **`PeriodPicker`** : deux boutons au lieu de sept. Une famille **glissante** (30 jours
  par défaut, 7/90/12 mois derrière la flèche) et une famille **calendaire**. Chaque
  bouton affiche la période active de sa famille.

  Le menu calendaire ne liste pas que des préréglages : il descend dans les **périodes
  closes**, en trois mailles séparées par un filet — « Ce mois » puis les 12 mois révolus
  (« Août 2026 »), « Ce trimestre » puis les 4 derniers (« T2 2026 »), « Cette année »
  puis toutes les années jusqu'à `company.foundedOn`, et « Tout » pour finir. L'ordre suit
  la façon dont on cherche : le mois d'abord, puis on élargit.

  Ces entrées posent un `preset: 'custom'` avec des bornes **figées** — « Août 2026 »
  désigne août 2026 pour toujours, là où un préréglage se recalcule chaque jour — et un
  `customLabel` que le bouton affiche à la place du préréglage. Éditer les dates à la main
  efface ce nom : deux bornes libres ne sont plus « Août 2026 ». Sans `foundedOn`, la
  liste des années retombe sur trois ans (`MAX_YEARS` plafonne à 15 : une date de création
  saisie de travers ne doit pas produire un menu de cent lignes).
  Il n'y a **plus de bouton « Personnalisé »** : la période affichée est elle-même le
  bouton — cliquer « 5 août – 3 sept. 2026 » ouvre deux champs de date, préremplis avec
  les bornes courantes. Le préréglage `qtd` (« Ce trimestre ») a été ajouté pour cette
  famille : c'est la maille des échéances fiscales.

- **`ChannelPicker`** : un déclencheur unique qui empile les **miniatures** des chaînes
  retenues (`ChannelAvatar`, jusqu'à 3, puis un compteur) et affiche le nom quand il n'y
  en a qu'une. « Toutes » n'est pas une case mais **l'absence de sélection** — c'est déjà
  ce que l'API attend. `onSelect` est neutralisé (`preventDefault`) pour que le menu ne se
  referme pas au premier clic : on en coche souvent deux.

`ChannelAvatar` affiche `channel.thumbnailUrl` (collecté par `CollectMetrics`, migration 12) et retombe sur l'**initiale sur la couleur de la chaîne** — ce n'est pas un cas
d'erreur : une chaîne manuelle n'a jamais de miniature. La couleur du texte passe par
`readableTextColor`.

La case **« Marquer les sorties de vidéo »** a quitté la barre pour **Paramètres →
Application** : c'était le seul réglage de la barre à ne jamais bouger, et il occupait
une place que la barre n'avait plus. La distinction est nette et vaut pour la suite : un
**filtre** change _ce qu'on regarde_ et se règle plusieurs fois par session ; une
**préférence** change _comment l'outil se présente_ et se règle une fois
(`usePreferences`, clé `acs.preferences` : `sidebarCollapsed`, `compactQueue`).

Ce qui reste dans la barre, dans l'ordre où on s'en sert : période, chaînes, pas
d'agrégation, puis l'interrupteur CA / Bénéfices, la case « Produits reçus » et le bouton
« Collecter ».

Ces réglages pilotent **tous** les graphiques et toutes les cartes : les laisser dans l'un des graphiques obligeait à remonter pour changer d'avis. Le titre du graphique d'argent suit l'interrupteur, il ne le porte plus. L'onglet Application lit le nombre de sorties via `useAnalytics(useAnalyticsParams())` — même clé de cache que le dashboard, donc requête partagée et non dupliquée.

Deux cartes déplient un panneau au survol (prop `details` de `StatCard`, ouvert aussi au clavier via `focus-within`) : « Vidéos publiées » montre les miniatures des sorties, « Produits reçus » la liste des produits et leur valeur. Le détail des produits ne vient pas d'`analytics`, qui n'expose que des agrégats, mais de `useRevenues` borné **exactement** comme le dashboard — sans quoi le panneau contredirait le total juste au-dessus.

La carte « Abonnés gagnés » met le **gain** en grand et le total en sous-titre : sur une période, ce qui se pilote est la progression, pas un cumul qui ne bouge qu'à la marge.

Disposition du dashboard, de haut en bas : 11 cartes de stats, la **dernière sortie** en pleine largeur, les deux bandeaux d'alertes (production, légal), puis les graphiques d'argent et d'audience **côte à côte** à partir de `2xl`. **C'est tout** : anneaux, classements de partenaires et performance par vidéo ont migré vers `/chiffre-affaires` et `/contenu`, parce qu'empilés ici ils faisaient une page qu'on parcourait au lieu de la lire.

La grille de cartes est en `lg:grid-cols-4 2xl:grid-cols-6` et non en 5 colonnes : à 11 cartes, cinq colonnes laisseraient une dernière rangée d'une seule carte. Les **trois dernières** ne suivent pas la période — « En production », « Sponsos en cours », « Produits attendus » sont des états d'une file ou d'un pipeline, pas des flux, et leur sous-titre le dit.

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
| `useAddRequirement`, `useUpdateRequirement`, `useDeleteRequirement`                                                                                                                               | idem                                                  | Plans à filmer exigés par la marque                                                                 |
| `useLegalOverview`, `useLegalObligations`, `useUpdateCompany`, `useCreateObligation`, `useUpdateObligation`, `useDeleteObligation`, `useToggleLegalCheck`                                         | `application/legal/usecases/useLegal.ts`              | Société + obligations mensuelles                                                                    |
| `useStepTodos`, `useCreateStepTodo`, `useUpdateStepTodo`, `useDeleteStepTodo`                                                                                                                     | `application/production/usecases/useProductions.ts`   | Référentiel des tâches d'étape (cache 5 min)                                                        |
| `useProductionTodos`, `useToggleTodo`, `useAddProductionTodo`, `useDeleteProductionTodo`                                                                                                          | idem                                                  | Tâches d'une vidéo, coches comprises                                                                |
| `useTimeEntries`, `useRunningTimer`, `useStartTimer`, `useStopTimer`, `useCreateTimeEntry`, `useUpdateTimeEntry`, `useDeleteTimeEntry`                                                            | idem                                                  | Chronomètre et sessions de travail                                                                  |
| `useRecurringExpenses`, `useCreateRecurringExpense`, `useUpdateRecurringExpense`, `useDeleteRecurringExpense`                                                                                     | `application/expense/usecases/useExpenses.ts`         | Règles de dépense récurrente                                                                        |
| `useUpcomingExpenses`, `useUpcomingRevenues`, `useUpcomingRange`                                                                                                                                  | `application/expense/usecases/useUpcoming.ts`         | Ce qui est daté en avant (demain → +3 mois)                                                         |
| `usePreferences`                                                                                                                                                                                  | `presentation/hooks/usePreferences.ts`                | Menu replié, file compacte. Persisté en localStorage                                                |
| `usePlanningBoard`, `usePlanningItems`, `useReplan`, `useAddPlanTargets`, `useApproveSlot`, `useUnapproveSlot`, `useReorderPlanningItems`, `useRemovePlanningItem`                                | `application/planning/usecases/usePlanning.ts`        | La grille, la pile et le placement                                                                  |
| `usePlanningSettings`, `useUpdatePlanningSettings`, `useWorkHours`, `useReplaceWorkHours`, `useCalendars`                                                                                         | idem                                                  | Horaires de travail et connexion à l'agenda                                                         |
| `useInstagramOverview`, `useInstagramAccounts`, `useCollectInstagram`, `useCreateInstagramAccount`, `useUpdateInstagramAccount`, `useDeleteInstagramAccount`, `useRefreshInstagramToken`          | `application/instagram/usecases/useInstagram.ts`      | Comptes Instagram, séries et collecte                                                               |
| `useSlotFromTimeEntry`                                                                                                                                                                            | idem                                                  | Transforme une session de travail en créneau approuvé                                               |
| `nowMinutes`, `localToday`, `shiftDate`, `startOfWeek`                                                                                                                                            | idem                                                  | Le temps **local du navigateur**, envoyé à l'API — le serveur est en UTC                            |

Toute mutation d'argent invalide `['analytics', 'revenues', 'expenses']` (`MONEY_ROOTS`, `application/queryKeys.ts`). Une mutation de catégorie invalide en plus `['categories']` : elle change les couleurs et les libellés de tous les graphiques.

Une écriture de **favori** n'invalide que `legalBookmarks`, et pas `LEGAL_ROOTS` :
contrairement à une obligation, un lien ne touche ni au tableau mensuel, ni aux alertes,
ni au dashboard — repartir sur tout l'écran ferait clignoter le tableau pour un
changement de libellé.

`LEGAL_ROOTS` (`legalOverview`, `legalObligations`) part en entier à chaque écriture du module légal : changer un jour limite déplace l'échéance sur tous les mois déjà affichés, et cocher une case retire une alerte du dashboard.

`PLANNING_ROOTS` = `PRODUCTION_ROOTS` + `planningSettings` + `workHours`, et
`PRODUCTION_ROOTS` porte désormais `planningBoard` / `planningItems` : le croisement va dans
les **deux** sens. Approuver un créneau enregistre une session et peut cocher une tâche —
l'avancement de la file et le compteur de la fiche bougent ; cocher une tâche depuis une
fiche la retire de la pile — la grille et la pile bougent. `calendars` n'est dans aucune
racine : la liste des calendriers de l'instance ne dépend d'aucune écriture de notre côté,
et la relire à chaque approbation ferait un aller-retour vers la domotique pour rien.

`RECURRING_ROOTS` = `MONEY_ROOTS` + `recurringExpenses` : écrire une règle crée, réécrit
ou supprime des dépenses, les vues d'argent repartent avec elle. Le contraire n'est pas
vrai — supprimer une occurrence à la main ne touche pas la règle.

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
- **Migration 9** ajoute `company` (ligne unique), `legal_obligations` et `legal_checks`. **Migration 10** ajoute `sponsorships.script`, **migration 11** la table `sponsorship_requirements`. **Migration 17** ajoute `videos.deleted_at`. **Migration 16** remplace `frequency` par
  `interval_months` sur les récurrences.
  **Migration 15** ajoute `affiliate_platforms`, `affiliate_platform_brands` et
  `revenue_entries.platform_id`. **Migration 14** ajoute `video_stat_snapshots`.
  **Migration 13** ajoute `legal_bookmarks`. **Migration 12** en ajoute trois d'un coup — `production_time_entries` (le temps passé), `step_todos` / `production_todos` / `production_todo_checks` (les tâches d'étape), `recurring_expenses` + `expense_entries.recurring_id` (les dépenses qui reviennent) — et la colonne `channels.thumbnail_url`.
- **Un panneau plutôt qu'une page dès que deux écrans le partagent** : `RevenuesPanel` et `ExpensesPanel` (ex-pages) sont montés dans les onglets de `/chiffre-affaires` ; `MoneyBreakdowns` porte les trois anneaux et les deux classements ; `PartnerStatCards` les quatre chiffres du pipeline. Le dupliquer ferait diverger deux écrans qui doivent annoncer le même montant.
- **Le calcul du pipeline vit dans le domaine** (`domain/partner/services/pipeline.ts`, `partnerPipeline`) et non dans les écrans : le dashboard et `/partenariats` affichent le même « à encaisser », et deux comptages parallèles finiraient par se contredire.
- **Migration 18** ajoute `work_hours`, `planning_settings`, `planning_items`, les colonnes
  `default_minutes` (étapes et tâches) et quatre colonnes sur `production_slots`
  (`origin`, `item_id`, `calendar_uid`, `time_entry_id`). Elle n'ajoute **pas** de `status`
  aux créneaux : `origin` + `done` disent déjà tout, et un troisième champ finirait par les
  contredire.
- **Migration 20** ajoute `ig_accounts`, `ig_account_snapshots`, `ig_daily_metrics`,
  `ig_stories` et `ig_media` — un domaine séparé, pas une extension de `channels`.
- **Migration 19** ajoute `production_time_entries.todo_id` : le temps se qualifie à la
  sous-étape. Pas de clé étrangère — `todo_id` désigne l'une **ou** l'autre des deux tables
  de tâches, comme les coches et la pile du planning.
- **Le SQL des migrations n'accepte pas de backtick.** Le bloc `up` est un template
  literal : un `` `nom_de_table` `` dans un commentaire SQL le referme et casse tout le
  fichier. Les commentaires des migrations citent donc les identifiants entre guillemets
  doubles, et sans accents — comme le reste du fichier. **Le piège vaut pour tout SQL écrit
  dans un template literal**, y compris les requêtes des dépôts (`VIEW_SQL` de
  `SqliteTimeEntryRepository` est tombé dedans).
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
- **Le bloc « Dernière sortie » du dashboard ignore la période** (`LatestVideoCard`, alimenté par `useVideos({ limit: 1 })` sans bornes de date) : « ma dernière vidéo marche comment » ne se pose pas dans une fenêtre de temps, et une période de 7 jours viderait le bloc précisément quand on vient le lire. Ses compteurs sont des **cumuls depuis la sortie** : ils ne s'additionnent pas avec les totaux affichés juste au-dessus, qui comptent aussi les vidéos plus anciennes. `stats.updatedAt` à `null` affiche « — » partout plutôt qu'une série de zéros.
- **`/contenu` ne porte que de la mesure** : ce qui n'est pas encore publié se pilote sur `/production`, la dernière sortie se lit sur le dashboard. Y remettre une file ou un fil de sorties ferait trois endroits où lire la même chose.
- **Une journée sans collecte Instagram est une journée de stories perdue pour toujours.**
  L'API ne les expose que 24 h, et rien — ni archive, ni story à la une — ne permet de
  revenir en arrière. C'est pour ça qu'Instagram passe **avant** YouTube dans le scheduler
  et que son échec est avalé séparément : une collecte YouTube ratée se rattrape au passage
  suivant, pas celle-là.
- **Un zéro story avant `firstStoryDate` ne veut pas dire « rien publié ».** L'écran le dit
  explicitement ; ne jamais retirer ce bandeau, un mois d'avant l'installation se lirait
  sinon comme un mois sans activité.
- **Une story vue par moins de cinq comptes ne renvoie aucune statistique** : Meta répond
  une erreur, pas un zéro. `insightsAt` reste à `null` et l'affichage montre « — ». Ce
  n'est pas une panne à corriger.
- **`impressions` et `profile_views` sont morts** (2025), remplacés par `views`. Une
  métrique dépréciée fait échouer **toute** la requête d'insights, pas seulement son champ
  — d'où le repli métrique par métrique de `fetchDayTotals` et le double essai de
  `fetchMediaInsights`. Ne jamais regrouper des métriques incertaines dans un seul appel.
- **`reach` est la seule métrique de compte disponible en série quotidienne.** Tout le
  reste est un `total_value` qui coûte **une requête par jour** : c'est ce qui borne
  `BACKFILL_DAYS` à 30, et pourquoi élargir la fenêtre coûte cher très vite.
- **`end_time` d'une série de portée désigne la FIN du jour mesuré** : le jour concerné est
  la veille. Le prendre tel quel décalerait toute la courbe d'une journée.
- **Le jeton Instagram expire au bout de 60 jours.** Meta n'en délivre pas de perpétuel.
  L'alerte se déclenche à 10 jours ; `META_APP_ID` et `META_APP_SECRET` permettent
  l'échange automatique, sans eux la régénération est manuelle.
- **Supprimer un compte Instagram efface un historique irrécupérable.** Contrairement à une
  chaîne YouTube, dont tout se recollecte, les stories parties ne reviendront jamais.
  L'écran propose l'archivage et le dit dans sa confirmation.
- **Les référentiels ne se sèment qu'une fois : à la création de la base, et plus jamais.**
  Étapes, tâches d'étape, catégories et obligations légales tournaient à chaque démarrage
  en n'insérant que ce qui manquait (`ON CONFLICT DO NOTHING`), ce qui ressuscitait tout ce
  qu'on avait supprimé au redéploiement suivant — la suppression était de fait inopérante.
  La condition est **`isFreshDatabase()`** (`user_version` à 0 avant migration), pas la
  table vide : la migration 2 insère la catégorie « impots » avant que le moindre seed
  n'ait tourné, et se fier au décompte sauterait le seed des catégories — AdSense comprise,
  qui est structurelle. La table entièrement vide reste un filet en second, pour qu'un
  référentiel vidé par accident ne laisse pas un écran qui se lit comme une panne.
  Conséquence assumée : un futur défaut ajouté au code n'apparaîtra pas sur une base déjà
  remplie.
- **L'ordre d'un référentiel se réécrit en entier.** `reorder` pose `1..n` sur toute la
  liste en transaction. Ne jamais revenir à un échange de deux `sortOrder` : rien ne
  garantit qu'ils soient distincts, et deux rangs égaux s'échangent sans effet visible.
  Les tâches se réordonnent dans leur étape mais l'API reçoit **toutes** les tâches, celles
  des autres étapes inchangées — le tri les regroupe déjà par étape, un rang par étape
  n'aurait rien apporté.
- **Le tableau légal s'applique rétroactivement.** Une obligation ajoutée aujourd'hui apparaît sur **tous** les mois depuis la création de la société, donc immédiatement « en retard » sur les mois passés. C'est le comportement demandé (une ligne par mois depuis la création) ; pour retirer une obligation devenue caduque sans perdre l'historique coché, l'**archiver** plutôt que la supprimer — la supprimer efface les cases de tous les mois.
- **Sans `company.foundedOn`, le tableau légal retombe sur les 12 derniers mois** (`FALLBACK_MONTHS`). Ce n'est pas un bug : c'est ce qui permet de cocher quelque chose avant d'avoir renseigné la fiche. La date se saisit dans Paramètres → Société.
- **Le mois d'une case est `AAAA-MM`, jamais une date.** `/api/legal/checks/:id/:month` valide le format en 422 : un `2026-3` passerait silencieusement à côté de toutes les lignes existantes, et la case paraîtrait ne jamais se cocher.
- **Le script d'une sponso a son propre bouton**, pas une case dans la modale d'édition : `SponsorshipScriptDialog` réutilise le `ScriptEditor` des productions (même markdown, même durée de lecture, même absence d'enregistrement automatique). `PartnersPage` garde l'**identifiant** de la sponso ouverte et non la fiche : après enregistrement la liste est rechargée, et un instantané figé laisserait l'éditeur croire éternellement qu'il reste du non-enregistré.
- **Les plans exigés se cochent sans bouton d'enregistrement**, contrairement au script juste en dessous. Ce n'est pas une incohérence : cocher est un geste unique et sans perte possible, alors qu'un texte en cours de réflexion demande une décision explicite. Leurs mutations n'invalident que `['sponsorships']` et pas `PARTNER_ROOTS` — cocher « macro du logo » ne change ni un revenu, ni une alerte, ni un classement de marque, et repartir sur tout le module ferait clignoter le dashboard pour une case.

- **Le chronomètre vit en base, pas dans le navigateur.** Une session en cours est une ligne sans `ended_at`. Conséquence : il n'y en a **qu'une à la fois** pour tout l'outil, et démarrer un chronomètre arrête celui qui courait au lieu de refuser — un refus obligerait à retrouver soi-même la session oubliée de la veille, qui aurait alors compté douze heures de montage.
- **Un temps non qualifié ne se rattrape pas.** L'étape est demandée **au démarrage** (`StartTimerDialog`), pas à l'arrêt : au moment de couper, on ne sait déjà plus si l'heure passée était de l'écriture ou du montage — et c'est exactement la question à laquelle ce suivi doit répondre. « Sans étape » reste possible : mieux vaut un temps mal rangé qu'un temps jamais mesuré.
- **Cliquer une pastille d'étape ne coche plus l'étape** : elle ouvre `StepTodosDialog`. Une étape n'est pas un interrupteur, c'est une liste de choses à faire, et la marquer terminée alors qu'il reste le sound design est ce qui fait perdre le fil. La pastille affiche « 2/5 » dès qu'il y a des tâches, et un trait plein (au lieu de pointillé) quand elle est commencée sans être finie.
- **Une tâche pèse autant qu'une étape dans l'avancement.** `stepProgress` et `progressCounts` comptent `étapes + tâches` au dénominateur : une étape à cinq tâches vaut donc six points. C'est voulu — le travail est dans les tâches, et une barre qui ne compterait que les étapes sauterait de 0 à 20 % sans rien montrer entre les deux. Le même calcul tourne côté API (`GetProductionOverview.buildStats`) : deux pondérations feraient dire deux choses au même écran.
- **Le référentiel de tâches se gère dans les paramètres, jamais depuis une vidéo.** `StepTodosDialog` ne supprime que les tâches `origin: 'production'` : retirer une tâche du référentiel depuis une fiche l'enlèverait de toutes les vidéos, y compris celles où elle était cochée.
- **Une occurrence de dépense récurrente supprimée à la main revient.** La projection garde douze échéances d'avance sans mémoire de ce qu'on a effacé. `ExpensesPanel` le dit dans sa confirmation, et la vraie solution est d'arrêter la règle (`isActive: false`) ou de la borner (`endDate`). Corriger un montant se fait sur la règle : `reproject` réécrit le mois courant et les suivants, jamais les mois clos.
- **Les lignes futures sont hors des totaux, et le bloc le dit.** `UpcomingSection` liste ce qui est daté de demain à +3 mois (`UPCOMING_MONTHS`), sous le tableau de la période et en fond estompé. Les mélanger au tableau ferait gonfler les dépenses du mois en cours d'un trimestre d'URSSAF qui n'est pas encore tombé ; les ignorer ferait tomber ce même trimestre sans prévenir. La fenêtre démarre à **demain** : une dépense datée du jour est déjà comptée dans la période, la faire apparaître aussi ici la ferait lire deux fois.
- **« Dont X d'impôts » s'appuie sur l'identifiant fixe `impots`** (`TAX_CATEGORY_ID`), celui du seed et de la migration 2 — pas sur le libellé, qui casserait au premier renommage. Une autre catégorie fiscale (URSSAF, TVA) compte dans le total mais pas dans cette baseline ; le panneau déplié de la carte donne le détail par catégorie.
- **Les « vues du catalogue » sont une estimation, et l'écran le dit.** C'est `totals.views` moins les vues cumulées des vidéos sorties **pendant** la période. YouTube ne fournit les compteurs par vidéo qu'en **cumul depuis la sortie**, jamais jour par jour : la soustraction ne tombe juste que sur une période qui va jusqu'à aujourd'hui, d'où le plancher à zéro. Le tableau `catalogPerformance`, lui, est exact — ce sont des cumuls assumés comme tels.
- **Le trait d'aujourd'hui du Gantt est au MILIEU de sa cellule** (`todayOffset =
todayColumn * cell + cell / 2`), pas à son bord gauche. Au bord, il tombe exactement sur
  la frontière entre hier et aujourd'hui : on ne sait plus lequel des deux jours il
  désigne. Le centrage à l'ouverture s'appuie sur le même offset, sinon la vue s'ouvrirait
  décalée d'une demi-colonne.
- **Le chevron de repli d'une carte de file est au même endroit dans les deux vues** —
  dernier à droite. Le déplacer d'un bord à l'autre en repliant obligerait à le rechercher
  à chaque fois, sur le seul bouton qu'on utilise en rafale.
- **Le planning s'ouvre centré sur aujourd'hui.** `ProductionGantt` pose `scrollLeft` au montage et à chaque changement de zoom, en retranchant la largeur de la colonne des titres (`TITLE_WIDTH`). Sans ça il s'ouvrait collé à sa borne gauche, sur des jours passés. Les fenêtres couvrent donc volontairement du passé (`before` : 14, 30 ou 60 jours) pour qu'on puisse reculer. La colonne des titres est `sticky left-0` : en défilant vers le futur, on doit continuer de savoir de quelle vidéo est la barre qu'on regarde.
- **La file d'attente a une vue compacte** (`preferences.compactQueue`) : une ligne par vidéo. Au-delà de cinq ou six vidéos en cours, la version détaillée oblige à faire défiler pour voir sa propre file. Le chevron d'une carte l'ouvre **à contre-courant du réglage global** (`exceptions`, un `Set` d'identifiants) : on veut souvent une file compacte _sauf_ la vidéo sur laquelle on travaille. Changer le réglage global vide les exceptions.
- **Les confettis sont maison** (`Confetti`, canvas, ~50 lignes, aucune dépendance) et ne se déclenchent qu'à la **publication** : c'est le seul moment de l'outil qui mérite d'être fêté, tout le reste est de la comptabilité et de la planification. Le canvas est `pointer-events-none` en position fixe — il recouvre l'écran sans jamais intercepter un clic — et se démonte tout seul.
- **Une vidéo supprimée sur YouTube disparaît des chiffres à la collecte suivante**, mais sa ligne reste en base (`deleted_at`). Les revenus et dépenses qui lui étaient rattachés gardent leur rattachement : l'argent a bien été gagné, même si la vidéo n'est plus en ligne. Conséquence à connaître : ces montants ne se lisent plus dans le tableau de performance, alors qu'ils comptent toujours dans les totaux de la période. C'est voulu — « ne plus être comptabilisée » porte sur la vidéo, pas sur l'euro.
- **La colonne « Plateforme » du tableau des revenus signale ce qui manque, pas ce qui est vide.** Un « À renseigner » en accent n'apparaît que sur les revenus de catégorie `affiliation` (identifiant fixe `AFFILIATE_CATEGORY_ID`) sans plateforme rattachée : AdSense, une sponso ou un produit reçu n'ont aucune raison d'en avoir une, et les marquer tous ferait une colonne d'avertissements qu'on cesserait de lire. Un compteur en tête donne le total à rattacher. La colonne entière disparaît tant qu'aucune plateforme n'existe — il n'y aurait rien à y renseigner.
- **Les identifiants fixes de catégorie vivent dans `domain/category/entities/Category.ts`**, des deux côtés (`ADSENSE_CATEGORY_ID`, `AFFILIATE_CATEGORY_ID`, `TAX_CATEGORY_ID`). Les règles qui doivent désigner _une_ catégorie précise s'y réfèrent : se fier au libellé casserait au premier renommage, qui est justement permis.
- **« Vues (période) » et « Vues (total) » ne mesurent pas la même chose.** La première vient de la différence de deux relevés datés (`video_stat_snapshots`), la seconde est le cumul depuis la sortie. Sur un catalogue, c'est l'écart entre les deux qui est l'information : une vidéo à 40 000 vues dont 30 sur le mois ne travaille plus, une à 4 000 dont 800 travaille encore. Le catalogue est d'ailleurs **trié sur la période** quand elle est connue, pas sur le cumul — sinon le classement ne bougerait jamais.
- **Les dépenses et revenus à venir sont dans le tableau, pas sous le tableau.** En tête, grisés, avec une icône de calendrier et une case pour les masquer. Ils **n'entrent jamais dans le total** affiché au-dessus, qui reste celui de la période — le sous-titre de la carte le répète, parce que c'est le genre de détail qui fait mal comprendre un chiffre.
- **Une vidéo à 0 % est repliée d'office** dans la file d'attente. Une carte détaillée sert à décider quoi faire ensuite : à 0 %, elle n'a ni étape cochée, ni créneau, ni argent à montrer. C'est un **défaut**, pas une règle : le chevron rouvre la carte, et le réglage global l'emporte dès qu'on y touche.
- **La barre de progression affiche le pourcentage, le détail est au survol.** Le pourcentage se compare d'une carte à l'autre ; le compte exact (« 18 sur 30 ») ne sert qu'à savoir combien il reste, ce qu'on ne demande que sur la vidéo qu'on s'apprête à attaquer.
- **L'en-tête n'a de hauteur que s'il porte la barre de filtres.** Sur `/production`, `/partenariats`, `/legal` et `/parametres`, il perd son trait et son padding : un bandeau vide repoussait le contenu pour rien. Le bandeau du chronomètre, lui, porte une bordure **haut et bas** (`border-y`) parce qu'il peut se retrouver seul tout en haut — c'est même le cas le plus probable, `/production` étant l'écran sans filtres où un chronomètre tourne.
- **Les liens utiles s'intercalent entre la fiche société et les alertes**, avant le tableau à cocher : on ouvre le portail, on fait la démarche, on revient cocher la case juste en dessous. La carte **entière** est le lien (cible la plus large) et s'ouvre dans un **nouvel onglet** — une navigation ferait perdre l'année choisie et la position dans le tableau. Le bloc ne s'affiche pas du tout tant qu'aucun lien n'est configuré : un encart vide prendrait la place de ce qu'on vient réellement faire sur cet écran.
- **Transformer une session en créneau ne crée aucune session.** La session existe déjà et
  c'est elle qui compte dans les totaux ; le créneau n'en est que la représentation dans le
  temps. Il naît `manual` **et** `done` — donc immobile, et occupant la place aux yeux du
  moteur, qui replanifie aussitôt ce qui se trouvait par-dessus. `time_entry_id` les relie,
  et `TimeEntryView.slotId` grise le bouton une fois le créneau posé.
- **`date` et `startTime` d'une conversion viennent du navigateur.** `startedAt` est un
  horodatage UTC et l'API tourne en UTC : en extraire l'heure côté serveur poserait le
  créneau deux heures trop tôt en été. Même règle que `nowMinutes` et `localToday`.
- **Approuver un créneau hérite de la sous-étape de la ligne de pile** (`planning_items.todoId`) :
  la session créée porte la même maille que ce qui avait été estimé, sans quoi on ne
  pourrait jamais comparer les deux.
- **La ligne « maintenant » et le jour courant ont leurs propres couleurs** (`--today`,
  `--now`), et non `--cash` / `--negative` qui portent déjà un sens comptable — un jour en
  bleu « cash » se lirait comme une information d'argent. Le trait traverse toute la
  largeur (situer l'heure sur les sept colonnes) et la pastille marque la seule colonne où
  « maintenant » a un sens. Il est rafraîchi toutes les 30 s : à la seconde, ce serait un
  rendu par seconde pour un pixel toutes les minutes.
- **L'heure visée est annoncée pendant tout le glissement**, à trois endroits : sur le
  bloc (elle prend la place du titre — sur un bloc d'un quart d'heure il n'y a qu'une
  ligne, et c'est l'heure qu'on veut y lire), dans la gouttière des heures, et par un trait
  en pointillés à la hauteur du début. Sans ça on déplace à l'aveugle : la grille n'a de
  repère qu'à l'heure pleine, et rien ne dit sur quel quart d'heure le bloc va retomber.
  Le déplacement est **borné à la grille visible** et non à la journée entière — sortir du
  cadre par un geste imprécis poserait un créneau à 3 h du matin.
- **Le bloc en cours de glissement n'est jamais démonté.** Il reste dans sa colonne
  d'origine et se décale par un `translateX` d'un nombre entier de colonnes. Le rendre
  dans la colonne survolée le retirerait du DOM le temps d'un rendu, et `setPointerCapture`
  partirait avec lui : le geste s'interromprait exactement au franchissement d'une
  frontière entre deux jours — c'est-à-dire dès qu'on essaie de déplacer un créneau d'un
  jour à l'autre. C'est le bug qu'avait la première version.
- **Le planning ne déplace jamais un créneau approuvé ni un créneau posé à la main.** La
  règle vit dans un seul `DELETE` (`clearSuggestions` : `origin = 'planner' AND done = 0`)
  et elle est le contrat du module. Toute nouvelle écriture qui touche `production_slots`
  doit s'y ramener : un créneau approuvé raconte du temps déjà passé, un créneau manuel a
  été voulu là où il est.
- **Déplacer un créneau au doigt le rend immobile.** Le glisser-déposer envoie
  `origin: 'manual'`, sans quoi le prochain « Repositionner » annulerait le geste. Ce champ
  n'existe que dans `updateProductionSlotSchema` — s'il en disparaissait, zod le filtrerait
  en silence et le drag paraîtrait ne rien faire. C'est exactement le bug qui s'est produit
  la première fois.
- **Le replan efface avant de compter, jamais l'inverse.** Le reste à faire d'une ligne est
  `plannedMinutes − approvedMinutes − scheduledMinutes`, et `scheduledMinutes` n'a de sens
  qu'**après** l'effacement : il ne compte alors que les créneaux qui ont survécu (les
  manuels, et ceux des autres jours quand on ne réorganise qu'une colonne). Compter avant
  ferait poser une seconde fois des heures déjà planifiées.
- **Un replan complet balaie aussi le passé non approuvé.** Une suggestion d'hier qu'on n'a
  jamais approuvée n'a rien raconté : la laisser ferait croire que ce travail est casé, et
  le moteur ne le reposerait jamais. `clearSuggestions(null, to)` s'en charge ; la version
  bornée ne sert qu'au bouton « réorganiser ce jour ».
- **Approuver n'est pas terminer, et l'API ne répond pas à la place de l'utilisateur.**
  `finished` est **obligatoire** dans le schéma zod. Un défaut ferait disparaître de la
  pile un travail à moitié fait, ou l'y laisserait pour toujours.
- **Approuver redimensionne le créneau sur le temps réellement passé.** Confirmer 30 minutes
  d'un bloc de 45 laisse un bloc de 30, et c'est cette durée qui est publiée dans l'agenda.
  Conséquence assumée : `unapprove` ne restaure pas la durée d'origine, qui n'est écrite
  nulle part — on la corrige à la main, ce qui est plus honnête que de réafficher une durée
  que personne n'a vécue.
- **Home Assistant sait créer un événement, pas le modifier ni le supprimer.** C'est la
  contrainte qui décide de toute l'architecture : les suggestions restent dans l'outil,
  seuls les créneaux approuvés partent dans l'agenda. Y publier des suggestions laisserait
  au premier replan une traînée d'événements fantômes qu'aucune API ne permet de retirer.
  Ne jamais « améliorer » ça sans vérifier que le core expose enfin une suppression.
- **La publication dans l'agenda ne peut pas faire échouer une approbation.** L'échec est
  avalé (`console.warn`) : le temps passé est déjà enregistré, et une instance domotique en
  train de redémarrer ne doit pas empêcher de cocher son travail. Même parti pris que
  `collectVideos`.
- **`calendar_uid` vaut « déjà poussé ».** Sa présence empêche de republier : sans lui, une
  réapprobation créerait un second événement, et rien ne permettrait de retirer le premier.
- **Les heures de l'agenda sont lues et écrites textuellement, jamais via un `Date`.**
  `2026-09-04T14:00:00+02:00` donne 14 h 00, et on renvoie `2026-09-04 14:00:00` sans
  décalage. L'API tourne en **UTC** dans un conteneur : recomposer l'heure avec l'horloge du
  serveur décalerait toute la journée de deux heures en été. Pour la même raison, `from` et
  `nowMinutes` viennent **du navigateur** (`localToday()`, `nowMinutes()`), jamais de
  `today()` côté API.
- **Les événements de journée entière n'occupent rien.** « Congés » couvrirait 24 h et
  rendrait la journée impossible à planifier, alors qu'il ne fait qu'étiqueter. Ils
  s'affichent en tête de colonne, hors de la grille horaire.
- **Une durée moyenne vide n'est pas zéro.** `default_minutes` à `null` fait retomber la
  tâche sur la durée de son étape, puis sur 60 minutes. Y écrire `0` ferait réserver zéro
  minute et le créneau ne serait jamais posé.
- **Cocher une tâche la retire de la pile, où qu'on le fasse.** La règle vit dans
  `ManageTodos`, à côté de celle qui coche l'étape : cocher depuis une fiche, depuis le
  planning ou par l'approbation d'un créneau doit avoir exactement le même effet. Décocher
  la remet dans la pile — **sans rendre les créneaux déjà posés**, qui racontent du temps
  passé et non du travail restant.
- **Retirer une ligne de la pile ne supprime pas ses créneaux** (`ON DELETE SET NULL` sur
  `item_id`), et supprimer un créneau ne retire pas la ligne de la pile — elle retrouvera
  une place au prochain replacement. C'est l'usage : « pas maintenant » n'est pas
  « jamais ».
- **Les créneaux suggérés apparaissent aussi dans l'écran Production** (prochains créneaux,
  charge de la semaine, Gantt) : ce sont de vrais `production_slots`. C'est voulu — du
  travail planifié est du travail planifié, quelle que soit la main qui l'a posé.
- **Le planning fonctionne sans agenda.** Sans connexion, il place les créneaux dans les
  horaires de travail sans connaître les rendez-vous, et l'écran le dit. Sans **horaires**,
  en revanche, il n'a nulle part où poser : c'est le seul blocage réel, et le bandeau
  renvoie directement vers le réglage.
- **`/api/productions/:id/todos` est monté AVANT `/api/productions`** dans `server.ts` : un router de préfixe plus long doit passer en premier, sinon le plus court capte la requête et répond 404. Même vigilance que `/overview` déclaré avant `/:id`.

## PWA

L'application s'installe sur l'écran d'accueil et se lance sans barre d'adresse. Trois
fichiers, tous dans `apps/web/public/` (donc copiés tels quels dans `dist` par Vite) :

| Fichier                  | Rôle                                           |
| ------------------------ | ---------------------------------------------- |
| `manifest.webmanifest`   | Nom, icônes, `display: standalone`, raccourcis |
| `sw.js`                  | Service worker, écrit à la main                |
| `icon-*.png`, `favicon*` | Le jeu d'icônes, dérivé d'un seul PNG source   |

### Les icônes

Toutes générées depuis **un seul PNG 256×256** (l'emoji 🎥 de Microsoft Teams), par un
script Pillow ponctuel — il n'y a pas de chaîne de génération dans le build, une icône ne
changeant qu'une fois tous les deux ans.

| Fichier                 | Taille  | Fond        | Pour qui                                 |
| ----------------------- | ------- | ----------- | ---------------------------------------- |
| `favicon.ico`           | 16→64   | transparent | onglet, vieux navigateurs                |
| `favicon-16/32.png`     | 16, 32  | transparent | onglet, navigateurs modernes             |
| `icon-192/512.png`      | 192,512 | transparent | manifeste, `purpose: any`                |
| `icon-maskable-512.png` | 512     | **blanc**   | manifeste, `purpose: maskable` (Android) |
| `apple-touch-icon.png`  | 180     | **blanc**   | écran d'accueil iOS                      |

Deux pièges, d'où les fonds blancs :

- **iOS ignore la transparence** et la compose sur du noir : sans fond opaque, l'icône
  d'écran d'accueil sort sur un carré noir. Elle est enregistrée en **RGB**, sans canal
  alpha, pour qu'il n'y ait aucune ambiguïté.
- **Une icône `maskable` est rognée** par Android selon la forme du lanceur (cercle,
  carré arrondi, squircle Samsung). Le sujet occupe donc **60 %** du canevas, ce qui le
  garde dans la zone de sécurité quelle que soit la découpe. Une icône transparente
  déclarée `maskable` se retrouverait, elle, sur un fond noir généré par le système.

iOS ne lit pas le manifeste pour l'icône : `apple-touch-icon` et les
`apple-mobile-web-app-*` de `index.html` sont **obligatoires** en plus, pas redondants.

### Le service worker

Écrit à la main plutôt qu'avec `vite-plugin-pwa` / Workbox, même parti pris que le Gantt
ou les confettis : le besoin tient en cinquante lignes, contre une dépendance de build et
un fichier généré de plus à déboguer.

**Aucune liste d'assets à précacher n'est figée** — c'est ce qui rend d'habitude un
service worker maison fragile, les fichiers de `dist/assets/` changeant de hash à chaque
build. La stratégie se déduit du type de requête :

| Requête               | Stratégie              | Pourquoi                                                               |
| --------------------- | ---------------------- | ---------------------------------------------------------------------- |
| Navigation            | réseau, cache en repli | en ligne, toujours le dernier `index.html`                             |
| `/assets/*`           | cache d'abord          | le hash est dans le nom, le contenu ne change jamais                   |
| Icônes, manifeste     | cache d'abord          | ils changent une fois par an                                           |
| `/api/*`              | **jamais de cache**    | un CA périmé affiché comme à jour fait plus de dégâts qu'un écran vide |
| Toute requête non-GET | ignorée                | mettre un POST en cache casse l'application en silence                 |

`skipWaiting()` + `clients.claim()` : la nouvelle version prend la main immédiatement,
sans quoi un correctif attendrait la fermeture de tous les onglets.

**Hors ligne, l'application se lance mais les écrans restent vides** : les données
viennent de l'API. C'est voulu.

`registerServiceWorker()` (appelé depuis `main.tsx`) **ne s'enregistre qu'en production**
(`import.meta.env.PROD`) : en développement, un service worker intercalé devant Vite sert
des modules périmés et fait passer le rechargement à chaud pour cassé. L'échec est avalé —
un contexte non sécurisé ou une navigation privée ne doit pas empêcher l'app de démarrer.

### Ce que nginx doit garantir

`nginx.conf` porte trois règles sans lesquelles la PWA se met à jour mal ou pas du tout :

- `location = /sw.js`, `= /index.html`, `= /manifest.webmanifest` → `no-cache,
must-revalidate`. Un service worker figé par un cache HTTP d'un an rendrait
  l'application impossible à mettre à jour sans vider le navigateur à la main.
- `default_type application/manifest+json;` **dans le `location = /manifest.webmanifest`**,
  pour que le manifeste ne sorte pas en `application/octet-stream` sur une version de
  nginx qui ignore l'extension.

  **Surtout pas un bloc `types` au niveau `server`.** La directive `types` _remplace_ la
  table MIME héritée du contexte `http` (`include mime.types`) au lieu de la compléter :
  plus de `text/html`, plus de `text/css`, plus d'`application/javascript`. Tout part en
  `application/octet-stream` et le navigateur **télécharge la page** au lieu de
  l'afficher. L'erreur a été commise une fois : elle rend le site entièrement
  inaccessible, et rien ne la signale — nginx répond 200 sur tout.

- `location ^~ /assets/` (et non `location /assets/`) : le `^~` fait passer ce préfixe
  **avant** la règle en expression régulière des icônes, qui sinon retirerait leur cache
  d'un an aux PNG hachés.

Le thème de la barre système suit le thème réel via deux `<meta name="theme-color">` à
`media` distinct ; le manifeste, lui, ne peut en porter qu'une seule (celle du thème
clair, celui par défaut).

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
