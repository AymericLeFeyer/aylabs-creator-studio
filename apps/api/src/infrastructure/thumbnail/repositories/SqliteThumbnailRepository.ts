import type { DatabaseSync } from 'node:sqlite';
import type {
  StoredThumbnailSettings,
  Thumbnail,
  ThumbnailAsset,
  ThumbnailImage,
  ThumbnailQuality,
} from '../../../domain/thumbnail/entities/Thumbnail.ts';
import type { ThumbnailRepository } from '../../../domain/thumbnail/repositories/ThumbnailRepository.ts';
import { newId } from '../../../shared/id.ts';

const ROW_ID = 'default';

const COLUMNS: Record<keyof StoredThumbnailSettings, string> = {
  encryptedApiKey: 'api_key',
  model: 'model',
  quality: 'quality',
  generalPrompt: 'general_prompt',
};

interface SettingsRow {
  api_key: string | null;
  model: string | null;
  quality: ThumbnailQuality;
  general_prompt: string;
}

interface AssetRow {
  id: string;
  label: string;
  created_at: string;
}

interface ThumbnailRow {
  id: string;
  production_id: string | null;
  title: string | null;
  format: Thumbnail['format'];
  prompt: string;
  created_at: string;
}

interface ImageRow {
  data: Uint8Array;
  mime_type: string;
}

const toAsset = (row: AssetRow): ThumbnailAsset => ({
  id: row.id,
  label: row.label,
  createdAt: row.created_at,
});

const toThumbnail = (row: ThumbnailRow): Thumbnail => ({
  id: row.id,
  productionId: row.production_id,
  title: row.title,
  format: row.format,
  prompt: row.prompt,
  createdAt: row.created_at,
});

const toImage = (row: ImageRow | undefined): ThumbnailImage | null =>
  row ? { data: row.data, mimeType: row.mime_type } : null;

/** Les listes ne lisent jamais `data` : une image pèse bien plus que toute sa ligne. */
export class SqliteThumbnailRepository implements ThumbnailRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  settings(): StoredThumbnailSettings {
    const now = new Date().toISOString();
    // La migration insère la ligne ; ce filet ne sert qu'à une base recopiée.
    this.db
      .prepare(
        'INSERT OR IGNORE INTO thumbnail_settings (id, created_at, updated_at) VALUES (?, ?, ?)',
      )
      .run(ROW_ID, now, now);
    const row = this.db
      .prepare(
        'SELECT api_key, model, quality, general_prompt FROM thumbnail_settings WHERE id = ?',
      )
      .get(ROW_ID) as unknown as SettingsRow;
    return {
      encryptedApiKey: row.api_key,
      model: row.model,
      quality: row.quality,
      generalPrompt: row.general_prompt,
    };
  }

  updateSettings(patch: Partial<StoredThumbnailSettings>): void {
    this.settings();
    const now = new Date().toISOString();
    for (const key of Object.keys(COLUMNS) as (keyof StoredThumbnailSettings)[]) {
      const value = patch[key];
      if (value === undefined) continue;
      this.db
        .prepare(`UPDATE thumbnail_settings SET ${COLUMNS[key]} = ?, updated_at = ? WHERE id = ?`)
        .run(value, now, ROW_ID);
    }
  }

  listAssets(): ThumbnailAsset[] {
    const rows = this.db
      .prepare('SELECT id, label, created_at FROM thumbnail_assets ORDER BY created_at, id')
      .all() as unknown as AssetRow[];
    return rows.map(toAsset);
  }

  addAsset(label: string, image: ThumbnailImage): ThumbnailAsset {
    const row: AssetRow = { id: newId(), label, created_at: new Date().toISOString() };
    this.db
      .prepare(
        'INSERT INTO thumbnail_assets (id, label, mime_type, data, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(row.id, row.label, image.mimeType, image.data, row.created_at);
    return toAsset(row);
  }

  assetImage(id: string): ThumbnailImage | null {
    return toImage(
      this.db.prepare('SELECT data, mime_type FROM thumbnail_assets WHERE id = ?').get(id) as
        ImageRow | undefined,
    );
  }

  deleteAsset(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM thumbnail_assets WHERE id = ?').run(id).changes) > 0;
  }

  list(productionId?: string): Thumbnail[] {
    const columns = 'id, production_id, title, format, prompt, created_at';
    const rows = (productionId
      ? this.db
          .prepare(
            `SELECT ${columns} FROM thumbnails WHERE production_id = ? ORDER BY created_at DESC`,
          )
          .all(productionId)
      : this.db
          .prepare(`SELECT ${columns} FROM thumbnails ORDER BY created_at DESC`)
          .all()) as unknown as ThumbnailRow[];
    return rows.map(toThumbnail);
  }

  add(thumbnail: Omit<Thumbnail, 'id' | 'createdAt'>, image: ThumbnailImage): Thumbnail {
    const created: Thumbnail = {
      ...thumbnail,
      id: newId(),
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO thumbnails (id, production_id, title, format, prompt, mime_type, data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        created.id,
        created.productionId,
        created.title,
        created.format,
        created.prompt,
        image.mimeType,
        image.data,
        created.createdAt,
      );
    return created;
  }

  image(id: string): ThumbnailImage | null {
    return toImage(
      this.db.prepare('SELECT data, mime_type FROM thumbnails WHERE id = ?').get(id) as
        ImageRow | undefined,
    );
  }

  delete(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM thumbnails WHERE id = ?').run(id).changes) > 0;
  }
}
