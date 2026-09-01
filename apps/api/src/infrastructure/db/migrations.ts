import type { DatabaseSync } from 'node:sqlite';

interface Migration {
  version: number;
  name: string;
  up: string;
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
];

/**
 * Applique les migrations manquantes dans une transaction.
 * `user_version` est le compteur natif de SQLite : pas de table de suivi à maintenir.
 */
export const runMigrations = (db: DatabaseSync): void => {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  const current = row?.user_version ?? 0;

  const pending = migrations.filter((m) => m.version > current);
  if (pending.length === 0) return;

  for (const migration of pending) {
    db.exec('BEGIN');
    try {
      db.exec(migration.up);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
      console.log(`[db] migration ${migration.version} appliquée : ${migration.name}`);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
};
