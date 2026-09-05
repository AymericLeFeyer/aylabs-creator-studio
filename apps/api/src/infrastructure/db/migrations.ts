import type { DatabaseSync } from 'node:sqlite';

interface Migration {
  version: number;
  name: string;
  up: string;
  /**
   * Reconstruction de table : `PRAGMA foreign_keys` doit être coupé **autour** de la
   * transaction, pas dedans — SQLite y ignore silencieusement le pragma.
   *
   * C'est le seul moyen de changer une contrainte `CHECK` : il faut recréer la table,
   * donc la `DROP`, et un `DROP` avec les clés étrangères actives déclenche les
   * `ON DELETE SET NULL` des tables qui la référencent. Sur `sponsorships`, ça
   * détacherait tous les produits rattachés et tous les revenus générés — un historique
   * cassé pour une contrainte élargie. La procédure suivie est celle documentée par
   * SQLite : couper les clés, créer, copier, supprimer, renommer, recouper.
   */
  rebuildsTable?: boolean;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
      CREATE TABLE channels (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        platform      TEXT NOT NULL DEFAULT 'youtube',
        mode          TEXT NOT NULL CHECK (mode IN ('public','oauth','manual')),
        external_id   TEXT,
        handle        TEXT,
        color         TEXT NOT NULL DEFAULT '#ef4444',
        refresh_token TEXT,
        is_archived   INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_channels_external
        ON channels(platform, external_id) WHERE external_id IS NOT NULL;

      -- Metriques de FLUX : ce qui s'est passe un jour donne.
      CREATE TABLE daily_metrics (
        channel_id               TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        date                     TEXT NOT NULL,
        views                    INTEGER NOT NULL DEFAULT 0,
        watch_minutes            REAL    NOT NULL DEFAULT 0,
        average_view_duration_sec REAL   NOT NULL DEFAULT 0,
        subscribers_gained       INTEGER NOT NULL DEFAULT 0,
        subscribers_lost         INTEGER NOT NULL DEFAULT 0,
        likes                    INTEGER NOT NULL DEFAULT 0,
        comments                 INTEGER NOT NULL DEFAULT 0,
        shares                   INTEGER NOT NULL DEFAULT 0,
        estimated_revenue_cents  INTEGER NOT NULL DEFAULT 0,
        source                   TEXT    NOT NULL DEFAULT 'youtube_analytics',
        PRIMARY KEY (channel_id, date)
      );
      CREATE INDEX idx_daily_metrics_date ON daily_metrics(date);

      -- Totaux CUMULES observes a un instant (un seul par jour et par chaine).
      CREATE TABLE channel_snapshots (
        channel_id   TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        date         TEXT NOT NULL,
        captured_at  TEXT NOT NULL,
        subscribers  INTEGER NOT NULL DEFAULT 0,
        total_views  INTEGER NOT NULL DEFAULT 0,
        total_videos INTEGER NOT NULL DEFAULT 0,
        source       TEXT NOT NULL DEFAULT 'youtube_data',
        PRIMARY KEY (channel_id, date)
      );
      CREATE INDEX idx_snapshots_date ON channel_snapshots(date);

      CREATE TABLE revenue_categories (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        nature      TEXT NOT NULL CHECK (nature IN ('cash','in_kind')),
        color       TEXT NOT NULL DEFAULT '#64748b',
        is_auto     INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      CREATE TABLE revenue_entries (
        id           TEXT PRIMARY KEY,
        channel_id   TEXT REFERENCES channels(id) ON DELETE SET NULL,
        category_id  TEXT NOT NULL REFERENCES revenue_categories(id) ON DELETE RESTRICT,
        date         TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        label        TEXT NOT NULL,
        notes        TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      CREATE INDEX idx_revenue_entries_date ON revenue_entries(date);
      CREATE INDEX idx_revenue_entries_channel ON revenue_entries(channel_id);
      CREATE INDEX idx_revenue_entries_category ON revenue_entries(category_id);

      CREATE TABLE tax_entries (
        id           TEXT PRIMARY KEY,
        channel_id   TEXT REFERENCES channels(id) ON DELETE SET NULL,
        date         TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        label        TEXT NOT NULL,
        notes        TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      CREATE INDEX idx_tax_entries_date ON tax_entries(date);
      CREATE INDEX idx_tax_entries_channel ON tax_entries(channel_id);
    `,
  },
  {
    version: 2,
    name: 'expenses_and_shared_categories',
    // Les taxes deviennent des DEPENSES categorisees, et les categories sont partagees
    // entre revenus et depenses : scope dit de quel cote chacune a le droit d'exister.
    up: `
      ALTER TABLE revenue_categories RENAME TO categories;
      -- SQLite ne sait pas ajouter de CHECK sur une colonne existante :
      -- la valeur est validee cote application (CATEGORY_SCOPES).
      ALTER TABLE categories ADD COLUMN scope TEXT NOT NULL DEFAULT 'revenue';

      -- Categorie d'accueil des anciennes taxes. Identifiant fixe, comme celles du seed.
      INSERT INTO categories
        (id, name, nature, color, is_auto, is_archived, sort_order, scope, created_at, updated_at)
      SELECT 'impots', 'Impôts', 'cash', '#f97316', 0, 0, 10, 'expense',
             datetime('now'), datetime('now')
      WHERE NOT EXISTS (SELECT 1 FROM categories WHERE id = 'impots');

      -- Recreation plutot que ALTER : category_id doit etre NOT NULL avec sa cle
      -- etrangere, ce qu'un ADD COLUMN ne permet pas.
      CREATE TABLE expense_entries (
        id           TEXT PRIMARY KEY,
        channel_id   TEXT REFERENCES channels(id) ON DELETE SET NULL,
        category_id  TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        date         TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        label        TEXT NOT NULL,
        notes        TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );
      INSERT INTO expense_entries
        (id, channel_id, category_id, date, amount_cents, label, notes, created_at, updated_at)
      SELECT id, channel_id, 'impots', date, amount_cents, label, notes, created_at, updated_at
        FROM tax_entries;
      DROP TABLE tax_entries;

      CREATE INDEX idx_expense_entries_date ON expense_entries(date);
      CREATE INDEX idx_expense_entries_channel ON expense_entries(channel_id);
      CREATE INDEX idx_expense_entries_category ON expense_entries(category_id);
    `,
  },
  {
    version: 3,
    name: 'videos',
    // Les sorties de video servent de reperes sur les graphiques : on ne stocke que
    // ce qui sert a poser un trait (date + titre), pas les statistiques par video.
    up: `
      CREATE TABLE videos (
        id            TEXT PRIMARY KEY,
        channel_id    TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        external_id   TEXT NOT NULL,
        title         TEXT NOT NULL,
        published_at  TEXT NOT NULL,  -- horodatage ISO complet renvoye par YouTube
        date          TEXT NOT NULL,  -- AAAA-MM-JJ, pour tomber dans le bon bucket
        thumbnail_url TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_videos_external ON videos(channel_id, external_id);
      CREATE INDEX idx_videos_date ON videos(date);
    `,
  },
  {
    version: 4,
    name: 'video_stats_and_links',
    // Deux ajouts d'un coup, parce qu'ils servent le meme ecran :
    // - les videos portent desormais leurs propres compteurs (collectes par chaine) ;
    // - un revenu ou une depense peut etre rattache a une video precise.
    // La cle etrangere est ajoutable par ALTER TABLE tant que le defaut vaut NULL.
    up: `
      ALTER TABLE videos ADD COLUMN views INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE videos ADD COLUMN watch_minutes REAL NOT NULL DEFAULT 0;
      ALTER TABLE videos ADD COLUMN subscribers_gained INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE videos ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE videos ADD COLUMN comments INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE videos ADD COLUMN estimated_revenue_cents INTEGER NOT NULL DEFAULT 0;
      -- NULL tant qu'aucune collecte de statistiques n'a abouti sur cette video :
      -- distingue « zero vue » de « pas encore mesure ».
      ALTER TABLE videos ADD COLUMN stats_updated_at TEXT;

      ALTER TABLE revenue_entries ADD COLUMN video_id TEXT
        REFERENCES videos(id) ON DELETE SET NULL;
      ALTER TABLE expense_entries ADD COLUMN video_id TEXT
        REFERENCES videos(id) ON DELETE SET NULL;
      CREATE INDEX idx_revenue_entries_video ON revenue_entries(video_id);
      CREATE INDEX idx_expense_entries_video ON expense_entries(video_id);
    `,
  },
  {
    version: 5,
    name: 'production',
    // Le module de production : ce qui se passe AVANT la publication.
    // Une `production` est une vidéo en préparation ; le jour où elle sort, elle se
    // rattache à la ligne `videos` collectée sur YouTube (`video_id`) et son travail
    // reste consultable au lieu d'être perdu.
    up: `
      -- Referentiel commun aux produits et aux sponsos : sans lui, « la marque qui
      -- donne le plus » ne serait qu'un champ texte impossible a regrouper.
      CREATE TABLE brands (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        website       TEXT,
        contact_name  TEXT,
        contact_email TEXT,
        color         TEXT NOT NULL DEFAULT '#64748b',
        notes         TEXT,
        is_archived   INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE INDEX idx_brands_name ON brands(name);

      -- Etapes configurables (ecriture, montage, miniature...). Ajouter une etape ne
      -- doit pas demander une migration : c'est une ligne, pas une colonne.
      CREATE TABLE production_steps (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        color       TEXT NOT NULL DEFAULT '#64748b',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      CREATE TABLE productions (
        id            TEXT PRIMARY KEY,
        channel_id    TEXT REFERENCES channels(id) ON DELETE SET NULL,
        -- Sortie reelle correspondante, renseignee a la publication.
        video_id      TEXT REFERENCES videos(id) ON DELETE SET NULL,
        title         TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'idea'
                      CHECK (status IN ('idea','in_progress','paused','done')),
        -- Pourquoi ca n'avance pas (attente d'un retour de marque, d'un produit...).
        paused_reason TEXT,
        paused_at     TEXT,
        start_date    TEXT,
        planned_date  TEXT,
        script        TEXT NOT NULL DEFAULT '',
        notes         TEXT,
        -- Ordre manuel de la file d'attente : l'outil ne deduit aucune priorite.
        sort_order    INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE INDEX idx_productions_status ON productions(status);
      CREATE INDEX idx_productions_sort ON productions(sort_order);
      -- Une sortie ne peut representer qu'une seule production.
      CREATE UNIQUE INDEX idx_productions_video
        ON productions(video_id) WHERE video_id IS NOT NULL;

      -- La PRESENCE de la ligne vaut « case cochee » : cocher/decocher est un
      -- INSERT/DELETE, et la date de completion vient gratuitement avec.
      CREATE TABLE production_step_checks (
        production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
        step_id       TEXT NOT NULL REFERENCES production_steps(id) ON DELETE CASCADE,
        checked_at    TEXT NOT NULL,
        PRIMARY KEY (production_id, step_id)
      );

      -- Creneaux de travail. Les heures sont facultatives : « mardi » est un creneau.
      CREATE TABLE production_slots (
        id            TEXT PRIMARY KEY,
        production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
        step_id       TEXT REFERENCES production_steps(id) ON DELETE SET NULL,
        date          TEXT NOT NULL,
        start_time    TEXT,
        end_time      TEXT,
        label         TEXT NOT NULL DEFAULT '',
        done          INTEGER NOT NULL DEFAULT 0,
        notes         TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE INDEX idx_production_slots_date ON production_slots(date);
      CREATE INDEX idx_production_slots_production ON production_slots(production_id);

      CREATE TABLE products (
        id               TEXT PRIMARY KEY,
        brand_id         TEXT REFERENCES brands(id) ON DELETE SET NULL,
        production_id    TEXT REFERENCES productions(id) ON DELETE SET NULL,
        channel_id       TEXT REFERENCES channels(id) ON DELETE SET NULL,
        -- Revenu en nature genere quand le produit passe a « recu ».
        revenue_entry_id TEXT REFERENCES revenue_entries(id) ON DELETE SET NULL,
        name             TEXT NOT NULL,
        url              TEXT,
        value_cents      INTEGER NOT NULL DEFAULT 0,
        status           TEXT NOT NULL DEFAULT 'discussion'
                         CHECK (status IN ('discussion','confirmed','shipped','received','returned','cancelled')),
        requested_at     TEXT,
        deadline         TEXT,
        received_at      TEXT,
        notes            TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
      CREATE INDEX idx_products_status ON products(status);
      CREATE INDEX idx_products_brand ON products(brand_id);
      CREATE INDEX idx_products_production ON products(production_id);
      CREATE INDEX idx_products_deadline ON products(deadline);

      CREATE TABLE sponsorships (
        id               TEXT PRIMARY KEY,
        brand_id         TEXT REFERENCES brands(id) ON DELETE SET NULL,
        production_id    TEXT REFERENCES productions(id) ON DELETE SET NULL,
        channel_id       TEXT REFERENCES channels(id) ON DELETE SET NULL,
        -- Revenu cash genere quand la sponso passe a « payee ».
        revenue_entry_id TEXT REFERENCES revenue_entries(id) ON DELETE SET NULL,
        label            TEXT NOT NULL,
        amount_cents     INTEGER NOT NULL DEFAULT 0,
        status           TEXT NOT NULL DEFAULT 'discussion'
                         CHECK (status IN ('discussion','todo','in_progress','paid','cancelled')),
        deadline         TEXT,
        paid_at          TEXT,
        notes            TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
      CREATE INDEX idx_sponsorships_status ON sponsorships(status);
      CREATE INDEX idx_sponsorships_brand ON sponsorships(brand_id);
      CREATE INDEX idx_sponsorships_production ON sponsorships(production_id);
      CREATE INDEX idx_sponsorships_deadline ON sponsorships(deadline);

      -- D'ou vient un revenu. Une entree generee par un produit ou une sponso ne se
      -- modifie plus depuis l'ecran Revenus, sinon les deux cotes divergent en silence.
      ALTER TABLE revenue_entries ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual';
    `,
  },
  {
    version: 6,
    name: 'product_sponsorship_link',
    // Un partenariat arrive souvent en deux morceaux : de l'argent ET du materiel.
    // Le lien est N:1 (une sponso peut venir avec plusieurs produits, un produit
    // n'appartient qu'a une sponso) et reste FACULTATIF des deux cotes : beaucoup de
    // produits arrivent sans contrepartie, et beaucoup de sponsos sans colis.
    // ON DELETE SET NULL : supprimer la sponso ne doit pas emporter le produit recu.
    up: `
      ALTER TABLE products ADD COLUMN sponsorship_id TEXT
        REFERENCES sponsorships(id) ON DELETE SET NULL;
      CREATE INDEX idx_products_sponsorship ON products(sponsorship_id);
    `,
  },
  {
    version: 7,
    name: 'ideas',
    // Le carnet de notes de la page production : ce qu'on jette en vrac avant de savoir
    // si ca fera une video. Volontairement pauvre — un titre et rien d'autre : le jour
    // ou l'idee merite des dates, un script et des creneaux, elle devient une production.
    up: `
      CREATE TABLE ideas (
        id         TEXT PRIMARY KEY,
        text       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_ideas_created ON ideas(created_at);
    `,
  },
  {
    version: 8,
    name: 'partner_video_link',
    // Un produit ou une sponso peut concerner une video DEJA SORTIE, qui n'a jamais eu
    // de fiche de production dans l'outil (tout l'historique collecte sur YouTube).
    // On garde les deux rattachements plutot qu'un seul : `production_id` designe une
    // video en preparation, `video_id` une sortie reelle. Ils sont exclusifs a l'usage
    // — le formulaire n'en pose qu'un — et la synchronisation prend `video_id` en
    // priorite, puis celui de la production.
    up: `
      ALTER TABLE products ADD COLUMN video_id TEXT
        REFERENCES videos(id) ON DELETE SET NULL;
      ALTER TABLE sponsorships ADD COLUMN video_id TEXT
        REFERENCES videos(id) ON DELETE SET NULL;
      CREATE INDEX idx_products_video ON products(video_id);
      CREATE INDEX idx_sponsorships_video ON sponsorships(video_id);
    `,
  },
  {
    version: 9,
    name: 'legal',
    // Le suivi administratif de la societe : une ligne par mois depuis la creation, et
    // une case a cocher par obligation.
    //
    // Les obligations sont des LIGNES et non des colonnes, meme raison que les etapes de
    // production : en ajouter une ne demande aucune migration, et « cochee » est la
    // PRESENCE d'une ligne dans `legal_checks` — cocher/decocher devient un INSERT ou un
    // DELETE, et la date de realisation vient gratuitement.
    //
    // `company` est une table a ligne unique (id = 'default') plutot qu'un fichier de
    // config : les infos se saisissent dans l'interface, et `founded_on` decide du
    // premier mois du tableau.
    up: `
      CREATE TABLE company (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL DEFAULT '',
        legal_form  TEXT,
        siret       TEXT,
        vat_number  TEXT,
        address     TEXT,
        founded_on  TEXT,
        notes       TEXT,
        updated_at  TEXT NOT NULL
      );
      INSERT INTO company (id, name, updated_at)
        VALUES ('default', '', datetime('now'));

      CREATE TABLE legal_obligations (
        id           TEXT PRIMARY KEY,
        label        TEXT NOT NULL,
        -- Jour limite dans le mois. NULL = pas d'echeance connue : le mois entier fait foi.
        day_of_month INTEGER,
        notes        TEXT,
        sort_order   INTEGER NOT NULL DEFAULT 0,
        is_archived  INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL
      );

      CREATE TABLE legal_checks (
        obligation_id TEXT NOT NULL REFERENCES legal_obligations(id) ON DELETE CASCADE,
        -- Mois vise, au format AAAA-MM : c'est la maille du tableau legal.
        month         TEXT NOT NULL,
        checked_at    TEXT NOT NULL,
        PRIMARY KEY (obligation_id, month)
      );
      CREATE INDEX idx_legal_checks_month ON legal_checks(month);
    `,
  },
  {
    version: 10,
    name: 'sponsorship_script',
    // Le texte de l'integration, ecrit par la marque ou negocie avec elle : elements de
    // langage, mentions obligatoires, code promo. Il vit sur la SPONSO et non sur la
    // production, parce qu'une meme video peut en porter deux, et qu'une sponso survit
    // au rattachement d'une production a l'autre.
    //
    // NOT NULL DEFAULT '' comme `productions.script` : une chaine vide se rend
    // directement, la sont les NULL a tester partout.
    up: `
      ALTER TABLE sponsorships ADD COLUMN script TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    version: 11,
    name: 'sponsorship_requirements',
    // Ce que la marque exige de voir a l'image : plan produit en main, macro du logo,
    // mention du code promo. C'est un cahier des charges de TOURNAGE, coche plan par
    // plan pendant qu'on filme.
    //
    // Ces lignes appartiennent a UNE sponso et ne sont pas un referentiel partage
    // (contrairement aux `production_steps`) : chaque marque pose ses propres
    // conditions, et les mutualiser obligerait a cocher « plan macro du logo » sur des
    // partenariats qui ne l'ont jamais demande.
    //
    // Ici la ligne EST l'item : « fait » ne peut donc pas etre sa presence, d'ou la
    // colonne `done` et son `done_at`. ON DELETE CASCADE, contrairement aux produits
    // qui sont detaches : une condition n'a aucun sens sans son partenariat.
    up: `
      CREATE TABLE sponsorship_requirements (
        id             TEXT PRIMARY KEY,
        sponsorship_id TEXT NOT NULL REFERENCES sponsorships(id) ON DELETE CASCADE,
        label          TEXT NOT NULL,
        done           INTEGER NOT NULL DEFAULT 0,
        done_at        TEXT,
        sort_order     INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );
      CREATE INDEX idx_sponsorship_requirements ON sponsorship_requirements(sponsorship_id);
    `,
  },
  {
    version: 12,
    name: 'time_tracking_todos_recurring',
    // Trois ajouts qui partagent la meme journee de travail :
    //
    // 1. LE TEMPS PASSE. Une ligne par session de travail. `ended_at` a NULL signifie
    //    « le chronometre tourne encore » — c'est ce qui permet de retrouver la session
    //    en cours apres un rechargement de page, sans rien stocker cote navigateur.
    //    `minutes` est FIGE a l'arret plutot que recalcule a la lecture : une saisie
    //    manuelle (« j'ai monte 2 h hier ») n'a pas d'horodatage fiable a soustraire.
    //
    // 2. LES TODOS D'ETAPE. Meme parti pris que les etapes elles-memes : ce sont des
    //    LIGNES, pas des colonnes. `step_todos` est le referentiel (les taches
    //    habituelles d'une etape, configurees une fois dans les parametres),
    //    `production_todos` porte les taches PONCTUELLES d'une seule video. Les deux se
    //    cochent dans la meme table `production_todo_checks`, ou la PRESENCE de la ligne
    //    vaut « fait » — comme `production_step_checks`. `todo_id` n'a donc pas de cle
    //    etrangere : il designe l'une ou l'autre des deux tables, et le nettoyage se
    //    fait a la suppression cote depot.
    //
    // 3. LES DEPENSES RECURRENTES. Un abonnement n'est pas une ligne de plus a saisir
    //    tous les mois : c'est une REGLE qui engendre des lignes. Les occurrences sont
    //    de vraies `expense_entries` (rien a changer dans les cumuls, les graphiques ou
    //    les categories), reliees a leur regle par `recurring_id`. L'index unique
    //    (recurring_id, date) rend la generation idempotente : la relancer ne cree
    //    jamais de doublon.
    up: `
      CREATE TABLE production_time_entries (
        id            TEXT PRIMARY KEY,
        production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
        -- Sur quoi ce temps a ete passe. NULL = travail non qualifie.
        step_id       TEXT REFERENCES production_steps(id) ON DELETE SET NULL,
        started_at    TEXT NOT NULL,
        -- NULL = le chronometre tourne encore.
        ended_at      TEXT,
        -- Duree figee a l'arret. NULL tant que la session est en cours.
        minutes       INTEGER,
        notes         TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE INDEX idx_time_entries_production ON production_time_entries(production_id);
      CREATE INDEX idx_time_entries_started ON production_time_entries(started_at);
      -- Retrouver la session en cours doit rester instantane : c'est la requete jouee
      -- a chaque chargement de l'ecran de production.
      CREATE INDEX idx_time_entries_running ON production_time_entries(ended_at)
        WHERE ended_at IS NULL;

      CREATE TABLE step_todos (
        id          TEXT PRIMARY KEY,
        step_id     TEXT NOT NULL REFERENCES production_steps(id) ON DELETE CASCADE,
        label       TEXT NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX idx_step_todos_step ON step_todos(step_id);

      CREATE TABLE production_todos (
        id            TEXT PRIMARY KEY,
        production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
        step_id       TEXT REFERENCES production_steps(id) ON DELETE CASCADE,
        label         TEXT NOT NULL,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE INDEX idx_production_todos_production ON production_todos(production_id);

      CREATE TABLE production_todo_checks (
        production_id TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
        -- Identifiant d'un step_todo OU d'un production_todo : pas de cle etrangere
        -- possible sur deux tables, le nettoyage se fait a la suppression.
        todo_id       TEXT NOT NULL,
        checked_at    TEXT NOT NULL,
        PRIMARY KEY (production_id, todo_id)
      );

      CREATE TABLE recurring_expenses (
        id            TEXT PRIMARY KEY,
        channel_id    TEXT REFERENCES channels(id) ON DELETE SET NULL,
        category_id   TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        label         TEXT NOT NULL,
        amount_cents  INTEGER NOT NULL,
        frequency     TEXT NOT NULL CHECK (frequency IN ('monthly','yearly')),
        -- Jour de prelevement. Un 31 sur un mois de 30 jours est ramene au dernier jour.
        day_of_month  INTEGER NOT NULL DEFAULT 1,
        -- Mois de prelevement (1-12), pour une echeance annuelle uniquement.
        month_of_year INTEGER,
        start_date    TEXT NOT NULL,
        -- NULL = sans fin : la regle continue de projeter des occurrences.
        end_date      TEXT,
        notes         TEXT,
        is_active     INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );

      ALTER TABLE expense_entries ADD COLUMN recurring_id TEXT
        REFERENCES recurring_expenses(id) ON DELETE SET NULL;
      CREATE INDEX idx_expense_entries_recurring ON expense_entries(recurring_id);
      -- Rend la generation idempotente : relancer la projection ne cree pas de doublon.
      CREATE UNIQUE INDEX idx_expense_recurring_date
        ON expense_entries(recurring_id, date) WHERE recurring_id IS NOT NULL;

      -- La miniature de la chaine, pour le selecteur compact de l'en-tete : une
      -- pastille de couleur ne suffit plus des qu'on en a cinq.
      ALTER TABLE channels ADD COLUMN thumbnail_url TEXT;
    `,
  },
  {
    version: 13,
    name: 'legal_bookmarks',
    // Les liens qu'on rouvre tous les mois pour faire ses declarations : Urssaf, impots,
    // portail de la banque, cabinet comptable. Ils n'ont rien a faire dans un signet de
    // navigateur — ils appartiennent a la meme page que les cases a cocher, juste au
    // dessus, parce que c'est la qu'on les cherche au moment de cocher.
    //
    // Une LIGNE et non une colonne, comme les obligations et les etapes de production :
    // en ajouter un ne demande aucune migration, et le referentiel se gere depuis
    // Parametres -> Societe.
    //
    // `image_url` est facultatif : sans image saisie, l'interface tente le favicon du
    // site cible puis retombe sur l'initiale sur fond colore. `color` est attribuee en
    // rotation a la creation, comme pour les chaines et les marques.
    up: `
      CREATE TABLE legal_bookmarks (
        id          TEXT PRIMARY KEY,
        label       TEXT NOT NULL,
        url         TEXT NOT NULL,
        description TEXT,
        image_url   TEXT,
        color       TEXT NOT NULL DEFAULT '#64748b',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX idx_legal_bookmarks_sort ON legal_bookmarks(sort_order);
    `,
  },
  {
    version: 14,
    name: 'video_stat_snapshots',
    // Un releve des compteurs d'une video, date du jour de la collecte.
    //
    // `videos` ne porte qu'un CUMUL depuis la sortie, ecrase a chaque collecte : il dit
    // « cette video a fait 40 000 vues », jamais « elle en a fait 800 le mois dernier ».
    // Or c'est cette seconde question qu'on pose devant un catalogue — une video de l'an
    // dernier qui rapporte encore des vues aujourd'hui n'apparaissait nulle part.
    //
    // Meme parti pris que `channel_snapshots` : une ligne CUMUL par jour, dont on prend
    // la DIFFERENCE entre deux dates pour obtenir un flux. YouTube Analytics ne donne les
    // compteurs par video qu'en cumul depuis la sortie, jamais jour par jour ; les
    // reconstituer par difference est la seule facon de les ventiler sur une periode
    // sans multiplier les appels d'API.
    //
    // Consequence assumee : l'historique commence a la premiere collecte suivant cette
    // migration. Tant qu'il n'existe pas deux releves encadrant la periode demandee, la
    // colonne affiche « — » plutot qu'un zero trompeur.
    up: `
      CREATE TABLE video_stat_snapshots (
        video_id                TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        -- AAAA-MM-JJ : un seul releve par jour et par video, le dernier ecrase le
        -- precedent (la collecte tourne toutes les heures).
        date                    TEXT NOT NULL,
        views                   INTEGER NOT NULL DEFAULT 0,
        watch_minutes           REAL    NOT NULL DEFAULT 0,
        subscribers_gained      INTEGER NOT NULL DEFAULT 0,
        likes                   INTEGER NOT NULL DEFAULT 0,
        comments                INTEGER NOT NULL DEFAULT 0,
        estimated_revenue_cents INTEGER NOT NULL DEFAULT 0,
        captured_at             TEXT NOT NULL,
        PRIMARY KEY (video_id, date)
      );
      CREATE INDEX idx_video_snapshots_date ON video_stat_snapshots(date);
    `,
  },
  {
    version: 15,
    name: 'affiliate_platforms',
    // Les plateformes d'affiliation : Amazon Partenaires, Awin, Effiliation...
    //
    // On y revient pour deux raisons, et elles demandent deux choses differentes :
    // « ou est-ce que je gere l'affiliation de telle marque » (le lien et les marques
    // couvertes) et « laquelle me rapporte le plus » (l'argent). La premiere se lit sur
    // la fiche, la seconde suppose de RATTACHER les revenus a une plateforme — d'ou la
    // colonne `revenue_entries.platform_id`, exactement comme `video_id`.
    //
    // Le lien avec les marques est N:N et FACULTATIF des deux cotes : une plateforme
    // couvre plusieurs marques, une marque peut etre dispo sur plusieurs plateformes, et
    // beaucoup de plateformes n'ont aucune marque connue au depart.
    up: `
      CREATE TABLE affiliate_platforms (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT,
        url         TEXT,
        image_url   TEXT,
        color       TEXT NOT NULL DEFAULT '#64748b',
        notes       TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      -- Table de liaison : la PRESENCE de la ligne vaut « cette marque est sur cette
      -- plateforme ». ON DELETE CASCADE des deux cotes — un lien n'a aucun sens sans
      -- l'un de ses deux bouts, et il ne porte aucune information propre a preserver.
      CREATE TABLE affiliate_platform_brands (
        platform_id TEXT NOT NULL REFERENCES affiliate_platforms(id) ON DELETE CASCADE,
        brand_id    TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        PRIMARY KEY (platform_id, brand_id)
      );
      CREATE INDEX idx_platform_brands_brand ON affiliate_platform_brands(brand_id);

      -- Rattachement d'un revenu a sa plateforme. Facultatif : tous les revenus ne
      -- viennent pas de l'affiliation. ON DELETE SET NULL — supprimer une plateforme ne
      -- doit pas emporter les euros qu'elle a rapportes.
      ALTER TABLE revenue_entries ADD COLUMN platform_id TEXT
        REFERENCES affiliate_platforms(id) ON DELETE SET NULL;
      CREATE INDEX idx_revenue_entries_platform ON revenue_entries(platform_id);
    `,
  },
  {
    version: 16,
    name: 'recurring_interval_months',
    // « Mensuel ou annuel » ne suffisait pas : il existe des abonnements bisannuels, et
    // demain des trimestriels. Plutot que d'ajouter une valeur a l'enumeration a chaque
    // fois — donc une migration a chaque fois —, la recurrence devient un NOMBRE DE MOIS.
    // 1 = mensuel, 3 = trimestriel, 12 = annuel, 24 = tous les deux ans.
    //
    // L'ancrage vient desormais de `start_date` seule : une regle tous les 24 mois qui
    // demarre en mars 2026 tombe en mars 2028. `month_of_year` n'a donc plus d'objet.
    //
    // Les colonnes `frequency` et `month_of_year` sont CONSERVEES mais ne sont plus
    // lues. Les supprimer imposerait de recreer la table, donc un DROP — et avec
    // `PRAGMA foreign_keys = ON`, un DROP declenche le `ON DELETE SET NULL` de
    // `expense_entries.recurring_id` et DETACHERAIT toutes les occurrences deja
    // projetees. Une colonne morte coute moins cher qu'un historique casse ; le depot
    // continue d'y ecrire une valeur de compatibilite pour satisfaire son CHECK.
    up: `
      ALTER TABLE recurring_expenses ADD COLUMN interval_months INTEGER NOT NULL DEFAULT 1;

      -- Reprise de l'existant : mensuel -> 1 mois, annuel -> 12 mois.
      UPDATE recurring_expenses SET interval_months = 12 WHERE frequency = 'yearly';
      UPDATE recurring_expenses SET interval_months = 1  WHERE frequency = 'monthly';

      -- Une regle annuelle ancree sur un autre mois que celui de sa date de debut voit
      -- son ancrage recale : sans ca, elle changerait d'echeance en silence.
      UPDATE recurring_expenses
         SET start_date = substr(start_date, 1, 4) || '-' ||
                          substr('0' || month_of_year, -2, 2) || '-' ||
                          substr(start_date, 9, 2)
       WHERE frequency = 'yearly'
         AND month_of_year IS NOT NULL
         AND month_of_year <> CAST(substr(start_date, 6, 2) AS INTEGER);
    `,
  },
  {
    version: 17,
    name: 'video_deleted_at',
    // Une video retiree de YouTube ne doit plus compter nulle part — mais sa ligne, elle,
    // doit rester.
    //
    // La SUPPRIMER emporterait tout ce qui s'y rattache : les revenus et depenses
    // imputes seraient detaches (`ON DELETE SET NULL`), la production qui l'a publiee
    // perdrait sa sortie, et les releves de `video_stat_snapshots` partiraient en
    // cascade. Un marquage garde l'argent la ou il a ete gagne et reste REVERSIBLE : si
    // la video reapparait — c'est le cas d'une video repassee en public apres un passage
    // en prive —, la collecte suivante remet `deleted_at` a NULL toute seule.
    //
    // C'est justement ce qui rend le marquage obligatoire plutot que la suppression : en
    // mode `public`, la playlist « uploads » ne renvoie PAS les videos privees ou non
    // listees. Une video simplement masquee est donc indiscernable d'une video effacee,
    // et supprimer sur cette base perdrait un historique qu'on ne peut pas reconstituer.
    up: `
      ALTER TABLE videos ADD COLUMN deleted_at TEXT;
      CREATE INDEX idx_videos_deleted ON videos(deleted_at);
    `,
  },
  {
    version: 18,
    name: 'planning',
    // Le planning : poser dans un agenda ce qu'il reste a faire.
    //
    // Quatre choses arrivent d'un coup parce qu'elles n'ont aucun sens separement — un
    // moteur de placement sans duree ne sait rien caler, et une duree sans horaires de
    // travail ne sait pas ou la poser.
    //
    // 1. `default_minutes` sur les etapes et les taches : la duree moyenne du travail.
    //    NULLABLE et non zero — « je ne sais pas » et « ca ne prend pas de temps » sont
    //    deux reponses differentes, et seule la premiere doit faire retomber la tache
    //    sur la duree de son etape.
    //
    // 2. `work_hours` : les plages travaillables d'une semaine type. PLUSIEURS LIGNES
    //    par jour — une journee coupee par la pause du midi est le cas normal, et une
    //    seule plage par jour ferait planifier a l'heure du dejeuner. Un jour sans
    //    aucune ligne n'est simplement pas travaille.
    //
    // 3. `planning_items` : la PILE de ce qui est en cours. Ajouter une video au
    //    planning en cochant « Ecriture » y depose une ligne par sous-etape ; le moteur
    //    les couvre de creneaux, et cocher la tache retire la ligne de la pile. C'est
    //    cette table qui distingue « planifie » de « fait » — les creneaux, eux, restent.
    //
    // 4. Trois colonnes sur `production_slots`. Pas de `status` : `origin` dit qui a
    //    pose le creneau et le `done` existant dit s'il est passe. Un `status` en plus
    //    redirait la meme chose et finirait par la contredire.
    //    La regle de deplacement en decoule : le moteur ne touche QUE
    //    `origin = 'planner' AND done = 0`. Un creneau approuve (donc `done = 1`) ou
    //    pose a la main ne bouge jamais.
    up: `
      ALTER TABLE production_steps  ADD COLUMN default_minutes INTEGER;
      ALTER TABLE step_todos        ADD COLUMN default_minutes INTEGER;
      ALTER TABLE production_todos  ADD COLUMN default_minutes INTEGER;

      CREATE TABLE work_hours (
        id         TEXT PRIMARY KEY,
        -- 0 = lundi, 6 = dimanche. Meme convention que bucketStart : la semaine
        -- commence le lundi, c'est celle qu'affiche le planning.
        weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
        start_time TEXT NOT NULL,
        end_time   TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_work_hours_weekday ON work_hours(weekday);

      -- Reglages du planning, LIGNE UNIQUE comme "company".
      -- "calendar_token" est le jeton d'acces longue duree Home Assistant : il est
      -- stocke en clair, comme le refresh token des chaines, et ne sort jamais de
      -- l'API (le depot le remplace par "hasToken" dans la vue).
      CREATE TABLE planning_settings (
        id                       TEXT PRIMARY KEY,
        calendar_base_url        TEXT,
        calendar_token           TEXT,
        -- Entite calendrier ou les creneaux approuves sont publies.
        target_calendar_id       TEXT,
        -- Entites lues pour connaitre l'occupation. CSV : la liste est courte et ne se
        -- requete jamais autrement qu'en entier.
        busy_calendar_ids        TEXT NOT NULL DEFAULT '',
        slot_granularity_minutes INTEGER NOT NULL DEFAULT 15,
        min_block_minutes        INTEGER NOT NULL DEFAULT 30,
        max_block_minutes        INTEGER NOT NULL DEFAULT 180,
        break_minutes            INTEGER NOT NULL DEFAULT 10,
        horizon_days             INTEGER NOT NULL DEFAULT 21,
        push_to_calendar         INTEGER NOT NULL DEFAULT 1,
        created_at               TEXT NOT NULL,
        updated_at               TEXT NOT NULL
      );
      INSERT INTO planning_settings (id, created_at, updated_at)
      VALUES ('default', datetime('now'), datetime('now'));

      CREATE TABLE planning_items (
        id             TEXT PRIMARY KEY,
        production_id  TEXT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
        step_id        TEXT REFERENCES production_steps(id) ON DELETE CASCADE,
        -- Designe "step_todos" OU "production_todos" : aucune cle etrangere n'est
        -- possible, exactement comme "production_todo_checks.todo_id". Le menage se
        -- fait cote depot.
        todo_id        TEXT,
        label          TEXT NOT NULL,
        planned_minutes INTEGER NOT NULL,
        -- Rang voulu : le moteur cale les items dans cet ordre et jamais autrement.
        sequence       INTEGER NOT NULL DEFAULT 0,
        status         TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'done', 'cancelled')),
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );
      -- Une meme tache ne se met pas deux fois dans la pile. COALESCE parce qu'une
      -- etape sans tache porte "todo_id" a NULL, et NULL n'est jamais egal a NULL.
      CREATE UNIQUE INDEX idx_planning_items_unique
        ON planning_items(production_id, COALESCE(step_id, ''), COALESCE(todo_id, ''));
      CREATE INDEX idx_planning_items_status ON planning_items(status);

      ALTER TABLE production_slots ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual';
      ALTER TABLE production_slots ADD COLUMN item_id TEXT
        REFERENCES planning_items(id) ON DELETE SET NULL;
      -- Identifiant du creneau une fois publie dans l'agenda. Sa presence vaut
      -- « deja pousse » : republier creerait un doublon qu'on ne peut pas retirer.
      ALTER TABLE production_slots ADD COLUMN calendar_uid TEXT;
      -- Session de travail creee a l'approbation, pour pouvoir la defaire.
      ALTER TABLE production_slots ADD COLUMN time_entry_id TEXT;
      CREATE INDEX idx_slots_item ON production_slots(item_id);
    `,
  },
  {
    version: 19,
    name: 'time_entry_todo',
    // Le temps passe se qualifie desormais a la SOUS-ETAPE, pas seulement a l'etape.
    //
    // « Le montage me prend deux fois plus que je ne le crois » se lit deja ; « c'est le
    // sound design qui mange le montage » ne se lit nulle part. C'est pourtant la seule
    // maille sur laquelle on peut agir — et c'est aussi celle sur laquelle le planning
    // reserve du temps, donc la seule qui permette de comparer l'estime au vecu.
    //
    // Pas de cle etrangere : `todo_id` designe `step_todos` OU `production_todos`,
    // exactement comme `production_todo_checks.todo_id` et `planning_items.todo_id`.
    // Une tache supprimee laisse la session en place avec un identifiant orphelin — le
    // temps a bien ete passe, et le perdre serait pire que de l'afficher sans libelle.
    up: `
      ALTER TABLE production_time_entries ADD COLUMN todo_id TEXT;
      CREATE INDEX idx_time_entries_todo ON production_time_entries(todo_id);
    `,
  },
  {
    version: 20,
    name: 'instagram',
    // Instagram : le compte, ses stories, ses publications.
    //
    // Un domaine a part et non une "channel" de plus : une chaine YouTube et un compte
    // Instagram ne mesurent pas les memes choses. `daily_metrics` porte des minutes vues,
    // une duree moyenne de visionnage et des revenus AdSense, dont aucun n'a de sens ici ;
    // `videos` porte des compteurs YouTube. Les melanger obligerait a laisser la moitie des
    // colonnes a NULL des deux cotes, et le premier calcul de moyenne serait faux.
    //
    // Le partage assume : deux ecrans, deux collectes, et l'argent continue de se rattacher
    // aux chaines. Le jour ou un revenu devra viser un compte Instagram, ce sera une
    // colonne de plus sur `revenue_entries`, pas une refonte.
    up: `
      -- Un compte Instagram Business ou Creator. Le jeton est stocke en clair, comme le
      -- refresh token des chaines, et ne sort JAMAIS de l'API (toChannelView pour les
      -- chaines, toAccountView ici).
      --
      -- "token_expires_at" existe parce que Meta ne delivre pas de jeton perpetuel : un
      -- jeton longue duree vit 60 jours. Sans cette date, la collecte s'arreterait un
      -- matin sans que rien ne l'ait annonce.
      CREATE TABLE ig_accounts (
        id               TEXT PRIMARY KEY,
        username         TEXT NOT NULL,
        name             TEXT,
        -- Identifiant du compte cote Meta. Unique : deux lignes pour le meme compte
        -- feraient deux fois les memes appels et deux fois les memes chiffres.
        ig_user_id       TEXT NOT NULL UNIQUE,
        access_token     TEXT,
        token_expires_at TEXT,
        profile_picture  TEXT,
        color            TEXT NOT NULL DEFAULT '#e1306c',
        is_archived      INTEGER NOT NULL DEFAULT 0,
        last_collected_at TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );

      -- CUMUL, une ligne par jour : abonnes, abonnements, nombre de publications.
      -- Meme nature que channel_snapshots — ces valeurs ne se somment pas entre deux
      -- jours, on prend la derniere connue du bucket.
      CREATE TABLE ig_account_snapshots (
        account_id      TEXT NOT NULL REFERENCES ig_accounts(id) ON DELETE CASCADE,
        date            TEXT NOT NULL,
        followers_count INTEGER,
        follows_count   INTEGER,
        media_count     INTEGER,
        created_at      TEXT NOT NULL,
        PRIMARY KEY (account_id, date)
      );

      -- FLUX, une ligne par jour. Se somment dans le bucket ET entre comptes.
      --
      -- Seul "reach" revient en serie quotidienne d'une traite (metric_type=time_series) ;
      -- tout le reste est un total_value qu'il faut demander jour par jour. C'est ce qui
      -- explique la fenetre de rattrapage courte de la collecte : rattraper trois mois
      -- couterait quatre-vingt-dix requetes par metrique.
      CREATE TABLE ig_daily_metrics (
        account_id         TEXT NOT NULL REFERENCES ig_accounts(id) ON DELETE CASCADE,
        date               TEXT NOT NULL,
        reach              INTEGER,
        views              INTEGER,
        total_interactions INTEGER,
        accounts_engaged   INTEGER,
        profile_links_taps INTEGER,
        created_at         TEXT NOT NULL,
        updated_at         TEXT NOT NULL,
        PRIMARY KEY (account_id, date)
      );

      -- Les stories. C'est LA table qui justifie ce module.
      --
      -- L'API ne les expose que pendant leurs 24 heures de vie — ni archivees, ni a la
      -- une, ni via aucun autre point d'entree. Le comptage "combien de stories par jour"
      -- ne peut donc pas etre reconstitue : il ne peut qu'etre ARCHIVE au fil de l'eau.
      -- Chaque collecte insere ce qu'elle voit et n'ecrase jamais une ligne existante par
      -- du vide. L'historique commence a la premiere collecte, exactement comme
      -- video_stat_snapshots.
      --
      -- "insights_at" a NULL distingue "pas encore mesuree" de "zero vue" — et il reste a
      -- NULL pour de bon sur une story vue par moins de cinq comptes, pour laquelle
      -- l'API refuse toute statistique.
      CREATE TABLE ig_stories (
        id            TEXT PRIMARY KEY,
        account_id    TEXT NOT NULL REFERENCES ig_accounts(id) ON DELETE CASCADE,
        ig_media_id   TEXT NOT NULL,
        media_type    TEXT,
        permalink     TEXT,
        thumbnail_url TEXT,
        -- Horodatage complet renvoye par l'API, et le jour local qui en est tire. Le jour
        -- est stocke plutot que calcule a la lecture : c'est la cle de tous les comptages,
        -- et le recalculer a chaque requete referait la conversion de fuseau a chaque fois.
        posted_at     TEXT NOT NULL,
        date          TEXT NOT NULL,
        views         INTEGER,
        reach         INTEGER,
        replies       INTEGER,
        insights_at   TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        UNIQUE (account_id, ig_media_id)
      );
      CREATE INDEX idx_ig_stories_date ON ig_stories(account_id, date);

      -- Les publications : posts, carrousels, reels. Rattrapables retroactivement, elles
      -- (deux ans de retention cote Meta), contrairement aux stories.
      CREATE TABLE ig_media (
        id            TEXT PRIMARY KEY,
        account_id    TEXT NOT NULL REFERENCES ig_accounts(id) ON DELETE CASCADE,
        ig_media_id   TEXT NOT NULL,
        media_type    TEXT,
        caption       TEXT,
        permalink     TEXT,
        thumbnail_url TEXT,
        posted_at     TEXT NOT NULL,
        date          TEXT NOT NULL,
        views         INTEGER,
        reach         INTEGER,
        likes         INTEGER,
        comments      INTEGER,
        saved         INTEGER,
        shares        INTEGER,
        -- NULL tant qu'aucune collecte n'a mesure la publication : l'ecran affiche alors
        -- un tiret et non un zero, meme regle que videos.stats.updatedAt.
        stats_at      TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        UNIQUE (account_id, ig_media_id)
      );
      CREATE INDEX idx_ig_media_date ON ig_media(account_id, date);
    `,
  },
  {
    version: 21,
    name: 'sponsorship_awaiting_payment',
    // « En attente de paiement » : la video est livree, la marque doit l'argent. C'etait
    // jusqu'ici indistinguable de « en cours », alors que ce sont deux gestes differents
    // — l'un demande de monter, l'autre de relancer. C'est ce statut qui passe en tete de
    // la liste des sponsos : c'est le seul sur lequel on peut agir aujourd'hui.
    //
    // Elargir un CHECK impose de recreer la table : d'ou `rebuildsTable`, et la procedure
    // documentee par SQLite. Les colonnes sont reprises dans l'ordre exact de la table
    // actuelle (migration 5, puis "video_id" en 8 et "script" en 10) ; les index sont
    // recrees, le DROP les ayant emportes.
    rebuildsTable: true,
    up: `
      CREATE TABLE sponsorships_new (
        id               TEXT PRIMARY KEY,
        brand_id         TEXT REFERENCES brands(id) ON DELETE SET NULL,
        production_id    TEXT REFERENCES productions(id) ON DELETE SET NULL,
        channel_id       TEXT REFERENCES channels(id) ON DELETE SET NULL,
        revenue_entry_id TEXT REFERENCES revenue_entries(id) ON DELETE SET NULL,
        label            TEXT NOT NULL,
        amount_cents     INTEGER NOT NULL DEFAULT 0,
        status           TEXT NOT NULL DEFAULT 'discussion'
                         CHECK (status IN ('discussion','todo','in_progress',
                                           'awaiting_payment','paid','cancelled')),
        deadline         TEXT,
        paid_at          TEXT,
        notes            TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL,
        video_id         TEXT REFERENCES videos(id) ON DELETE SET NULL,
        script           TEXT NOT NULL DEFAULT ''
      );

      INSERT INTO sponsorships_new
        (id, brand_id, production_id, channel_id, revenue_entry_id, label, amount_cents,
         status, deadline, paid_at, notes, created_at, updated_at, video_id, script)
      SELECT id, brand_id, production_id, channel_id, revenue_entry_id, label, amount_cents,
             status, deadline, paid_at, notes, created_at, updated_at, video_id, script
        FROM sponsorships;

      DROP TABLE sponsorships;
      ALTER TABLE sponsorships_new RENAME TO sponsorships;

      CREATE INDEX idx_sponsorships_status ON sponsorships(status);
      CREATE INDEX idx_sponsorships_brand ON sponsorships(brand_id);
      CREATE INDEX idx_sponsorships_production ON sponsorships(production_id);
      CREATE INDEX idx_sponsorships_deadline ON sponsorships(deadline);
      CREATE INDEX idx_sponsorships_video ON sponsorships(video_id);
    `,
  },
];

/**
 * Applique les migrations manquantes dans une transaction.
 * `user_version` est le compteur natif de SQLite : pas de table de suivi à maintenir.
 *
 * Renvoie `true` quand la base **vient d'être créée** (`user_version` à 0 avant l'appel).
 * C'est la seule information qui permette aux seeds de distinguer « première ouverture »
 * de « redémarrage » : une base neuve reçoit ses référentiels de départ, une base déjà
 * utilisée n'y touche plus jamais. Sans ça, un référentiel ne peut pas se fier au fait que
 * sa table soit vide — la migration 2 insère par exemple la catégorie « impots » avant que
 * le moindre seed n'ait tourné.
 */
export const runMigrations = (db: DatabaseSync): boolean => {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  const current = row?.user_version ?? 0;
  const fresh = current === 0;

  const pending = migrations.filter((m) => m.version > current);
  if (pending.length === 0) return fresh;

  for (const migration of pending) {
    // Hors transaction, sinon le pragma est ignoré sans le moindre message.
    if (migration.rebuildsTable) db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(migration.up);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
      console.log(`[db] migration ${migration.version} appliquée : ${migration.name}`);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      if (migration.rebuildsTable) db.exec('PRAGMA foreign_keys = ON');
    }
  }

  return fresh;
};
