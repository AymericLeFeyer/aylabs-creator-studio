import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateInstagramAccountInput,
  InstagramAccount,
  InstagramAccountView,
  InstagramSnapshot,
  UpdateInstagramAccountInput,
} from '../../../domain/instagram/entities/InstagramAccount.ts';
import { DEFAULT_IG_COLORS } from '../../../domain/instagram/entities/InstagramAccount.ts';
import type { InstagramAccountRepository } from '../../../domain/instagram/repositories/InstagramRepository.ts';
import { newId } from '../../../shared/id.ts';
import { conflict, notFound } from '../../../shared/errors.ts';

interface Row {
  id: string;
  username: string;
  name: string | null;
  ig_user_id: string;
  access_token: string | null;
  token_expires_at: string | null;
  profile_picture: string | null;
  color: string;
  is_archived: number;
  last_collected_at: string | null;
  created_at: string;
  updated_at: string;
}

const toDomain = (row: Row): InstagramAccount => ({
  id: row.id,
  username: row.username,
  name: row.name,
  igUserId: row.ig_user_id,
  accessToken: row.access_token,
  tokenExpiresAt: row.token_expires_at,
  profilePicture: row.profile_picture,
  color: row.color,
  isArchived: row.is_archived === 1,
  lastCollectedAt: row.last_collected_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Les comptes Instagram.
 *
 * **Le jeton ne sort jamais d'ici.** `findAll` renvoie des `InstagramAccountView`, où il
 * est remplacé par `hasToken` — même règle que `toChannelView` pour le refresh token
 * d'une chaîne, et pour la même raison : ce qui ne traverse jamais une route ne peut pas
 * fuir par une capture d'écran. Seul `findById`, réservé à la collecte, le porte.
 */
export class SqliteInstagramAccountRepository implements InstagramAccountRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(includeArchived = false): InstagramAccountView[] {
    const clause = includeArchived ? '' : 'WHERE is_archived = 0';
    const rows = this.db
      .prepare(`SELECT * FROM ig_accounts ${clause} ORDER BY username`)
      .all() as unknown as Row[];

    return rows.map((row) => {
      const account = toDomain(row);
      const snapshot = this.db
        .prepare(
          `SELECT * FROM ig_account_snapshots
            WHERE account_id = ? ORDER BY date DESC LIMIT 1`,
        )
        .get(row.id) as
        | {
            account_id: string;
            date: string;
            followers_count: number | null;
            follows_count: number | null;
            media_count: number | null;
          }
        | undefined;

      const lastMetric = this.db
        .prepare('SELECT MAX(date) AS d FROM ig_daily_metrics WHERE account_id = ?')
        .get(row.id) as { d: string | null };

      const { accessToken: _token, ...rest } = account;
      return {
        ...rest,
        hasToken: account.accessToken !== null && account.accessToken.length > 0,
        latestSnapshot: snapshot
          ? ({
              accountId: snapshot.account_id,
              date: snapshot.date,
              followersCount: snapshot.followers_count,
              followsCount: snapshot.follows_count,
              mediaCount: snapshot.media_count,
            } satisfies InstagramSnapshot)
          : null,
        lastMetricDate: lastMetric.d,
        tokenDaysLeft: daysLeft(account.tokenExpiresAt),
      };
    });
  }

  findById(id: string): InstagramAccount | null {
    const row = this.db.prepare('SELECT * FROM ig_accounts WHERE id = ?').get(id) as
      Row | undefined;
    return row ? toDomain(row) : null;
  }

  findByIgUserId(igUserId: string): InstagramAccount | null {
    const row = this.db.prepare('SELECT * FROM ig_accounts WHERE ig_user_id = ?').get(igUserId) as
      Row | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateInstagramAccountInput): InstagramAccount {
    // Le même compte ajouté deux fois ferait deux fois les mêmes appels et compterait
    // chaque story en double dans les totaux.
    if (this.findByIgUserId(input.igUserId)) {
      throw conflict('Ce compte Instagram est déjà suivi.');
    }

    const id = newId();
    const now = new Date().toISOString();
    const count = (this.db.prepare('SELECT COUNT(*) AS n FROM ig_accounts').get() as { n: number })
      .n;

    this.db
      .prepare(
        `INSERT INTO ig_accounts
           (id, username, name, ig_user_id, access_token, token_expires_at, profile_picture,
            color, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, ?)`,
      )
      .run(
        id,
        input.username,
        input.name ?? null,
        input.igUserId,
        input.accessToken ?? null,
        input.tokenExpiresAt ?? null,
        // Couleur attribuée en rotation, comme les chaînes et les marques : deux comptes
        // de la même couleur seraient indistinguables sur un graphique.
        input.color ?? DEFAULT_IG_COLORS[count % DEFAULT_IG_COLORS.length]!,
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateInstagramAccountInput): InstagramAccount {
    const existing = this.findById(id);
    if (!existing) throw notFound('Compte Instagram');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.username !== undefined) set('username', input.username);
    if (input.name !== undefined) set('name', input.name);
    if (input.igUserId !== undefined) set('ig_user_id', input.igUserId);
    // `""` efface le jeton, absent le conserve — même convention que `refreshToken`.
    if (input.accessToken !== undefined) set('access_token', input.accessToken || null);
    if (input.tokenExpiresAt !== undefined) set('token_expires_at', input.tokenExpiresAt);
    if (input.profilePicture !== undefined) set('profile_picture', input.profilePicture);
    if (input.color !== undefined) set('color', input.color);
    if (input.isArchived !== undefined) set('is_archived', input.isArchived ? 1 : 0);
    if (input.lastCollectedAt !== undefined) set('last_collected_at', input.lastCollectedAt);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE ig_accounts SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  /**
   * Supprime le compte **et tout son historique** (cascade SQL).
   *
   * C'est irréversible d'une façon qui l'est plus qu'ailleurs : les stories ne se
   * recollectent pas. L'écran le dit dans sa confirmation, et propose l'archivage.
   */
  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM ig_accounts WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Compte Instagram');
  }
}

/** Jours restants avant expiration. Négatif = déjà expiré, `null` = date inconnue. */
const daysLeft = (expiresAt: string | null): number | null => {
  if (!expiresAt) return null;
  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((parsed - Date.now()) / 86_400_000);
};
