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
