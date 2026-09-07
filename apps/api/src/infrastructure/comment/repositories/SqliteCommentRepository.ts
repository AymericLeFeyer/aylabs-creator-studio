import type { DatabaseSync } from 'node:sqlite';
import type {
  CommentCounts,
  CommentStatus,
  CommentView,
  UpsertCommentInput,
} from '../../../domain/comment/entities/Comment.ts';
import { COMMENT_STATUSES } from '../../../domain/comment/entities/Comment.ts';
import type {
  CommentFilter,
  CommentRepository,
} from '../../../domain/comment/repositories/CommentRepository.ts';
import { placeholders } from '../../db/filters.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface CommentViewRow {
  id: string;
  channel_id: string;
  external_id: string;
  video_id: string | null;
  video_external_id: string | null;
  author_name: string;
  author_avatar_url: string | null;
  author_channel_id: string | null;
  text: string;
  like_count: number;
  published_at: string;
  date: string;
  status: string;
  curated_at: string | null;
  created_at: string;
  updated_at: string;
  channel_name: string;
  channel_color: string;
  channel_thumbnail_url: string | null;
  video_title: string | null;
  video_thumbnail_url: string | null;
}

const toView = (row: CommentViewRow): CommentView => ({
  id: row.id,
  channelId: row.channel_id,
  externalId: row.external_id,
  videoId: row.video_id,
  videoExternalId: row.video_external_id,
  authorName: row.author_name,
  authorAvatarUrl: row.author_avatar_url,
  authorChannelId: row.author_channel_id,
  text: row.text,
  likeCount: row.like_count,
  publishedAt: row.published_at,
  date: row.date,
  status: row.status as CommentStatus,
  curatedAt: row.curated_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  channelName: row.channel_name,
  channelColor: row.channel_color,
  channelThumbnailUrl: row.channel_thumbnail_url,
  videoTitle: row.video_title,
  videoThumbnailUrl: row.video_thumbnail_url,
});

/**
 * La jointure est la même pour toutes les lectures.
 *
 * La vidéo est en `LEFT JOIN` et non en `JOIN` : un commentaire tombe souvent sur une
 * sortie que la collecte n'a jamais ramenée — la fenêtre de collecte des vidéos ne
 * remonte qu'à la dernière connue moins sept jours. Une jointure stricte ferait
 * disparaître ces commentaires-là de tous les écrans, sans que rien ne le signale.
 */
const SELECT_VIEW = `
  SELECT c.*,
         ch.name AS channel_name,
         ch.color AS channel_color,
         ch.thumbnail_url AS channel_thumbnail_url,
         v.title AS video_title,
         v.thumbnail_url AS video_thumbnail_url
    FROM comments c
    JOIN channels ch ON ch.id = c.channel_id
    LEFT JOIN videos v ON v.id = c.video_id
`;

export class SqliteCommentRepository implements CommentRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private buildWhere(filter: CommentFilter): { clause: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    const statuses = filter.statuses ?? [];
    if (statuses.length > 0) {
      conditions.push(`c.status IN (${placeholders(statuses.length)})`);
      params.push(...statuses);
    }

    const channelIds = filter.channelIds ?? [];
    if (channelIds.length > 0) {
      conditions.push(`c.channel_id IN (${placeholders(channelIds.length)})`);
      params.push(...channelIds);
    }

    if (filter.range) {
      conditions.push('c.date BETWEEN ? AND ?');
      params.push(filter.range.from, filter.range.to);
    }

    const search = filter.search?.trim();
    if (search) {
      conditions.push('(c.text LIKE ? OR c.author_name LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like);
    }

    return {
      clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  findAll(filter: CommentFilter = {}): CommentView[] {
    const { clause, params } = this.buildWhere(filter);
    const limit = filter.limit ?? 1000;

    const rows = this.db
      .prepare(`${SELECT_VIEW} ${clause} ORDER BY c.published_at DESC LIMIT ${limit}`)
      .all(...(params as never[])) as unknown as CommentViewRow[];

    return rows.map(toView);
  }

  findById(id: string): CommentView | null {
    const row = this.db.prepare(`${SELECT_VIEW} WHERE c.id = ?`).get(id) as
      CommentViewRow | undefined;
    return row ? toView(row) : null;
  }

  /**
   * Insère ce qui manque, rafraîchit le reste — **jamais le statut ni `curatedAt`**.
   *
   * C'est toute la garantie du module : la collecte redescend chaque jour les mêmes
   * commentaires, et un commentaire écarté doit le rester. Le statut est la seule donnée
   * qui nous appartienne, et c'est pour ça qu'il ne figure ni dans la liste des colonnes
   * insérées ni dans le `DO UPDATE`.
   *
   * Le texte, les likes et l'avatar, eux, suivent : un commentaire édité doit s'afficher
   * tel qu'il est aujourd'hui, et le compteur de likes sert à ordonner le mur.
   *
   * Le rattachement à la vidéo est résolu **dans l'INSERT**, par sous-requête sur la clé
   * naturelle `(channel_id, external_id)` : c'est le seul moyen de le poser sans une
   * lecture par commentaire. Il vaut `NULL` quand la vidéo n'est pas connue, et
   * `linkVideos` le rattrapera.
   */
  upsertMany(comments: UpsertCommentInput[]): number {
    if (comments.length === 0) return 0;
    const now = new Date().toISOString();

    const stmt = this.db.prepare(
      `INSERT INTO comments
         (id, channel_id, external_id, video_id, video_external_id, author_name,
          author_avatar_url, author_channel_id, text, like_count, published_at, date,
          created_at, updated_at)
       VALUES (?, ?, ?,
               (SELECT v.id FROM videos v WHERE v.channel_id = ? AND v.external_id = ?),
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(channel_id, external_id) DO UPDATE SET
         text              = excluded.text,
         like_count        = excluded.like_count,
         author_name       = excluded.author_name,
         author_avatar_url = excluded.author_avatar_url,
         updated_at        = excluded.updated_at`,
    );

    // Un upsert rapporte `changes = 1` qu'il ait inséré ou mis à jour : SQLite ne les
    // distingue pas. On compte donc les créations en interrogeant la table avant
    // l'écriture — c'est une lecture indexée, et c'est ce compte que le compte-rendu de
    // collecte annonce (« 12 nouveaux commentaires »), pas le nombre de lignes touchées.
    let created = 0;

    this.db.exec('BEGIN');
    try {
      for (const comment of comments) {
        if (!this.isKnown(comment.channelId, comment.externalId)) created += 1;
        stmt.run(
          newId(),
          comment.channelId,
          comment.externalId,
          comment.channelId,
          comment.videoExternalId,
          comment.videoExternalId,
          comment.authorName,
          comment.authorAvatarUrl,
          comment.authorChannelId,
          comment.text,
          comment.likeCount,
          comment.publishedAt,
          comment.date,
          now,
          now,
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return created;
  }

  isKnown(channelId: string, externalId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 AS found FROM comments WHERE channel_id = ? AND external_id = ?')
      .get(channelId, externalId);
    return row !== undefined;
  }

  setStatus(id: string, status: CommentStatus): CommentView {
    const now = new Date().toISOString();
    // `curatedAt` retombe à `null` quand on remet le commentaire dans la file de tri :
    // il dit quand on a tranché, et on vient précisément de dé-trancher.
    const result = this.db
      .prepare('UPDATE comments SET status = ?, curated_at = ?, updated_at = ? WHERE id = ?')
      .run(status, status === 'new' ? null : now, now, id);
    if (result.changes === 0) throw notFound('Commentaire');
    return this.findById(id)!;
  }

  countByStatus(channelIds: string[] = []): CommentCounts {
    const clause =
      channelIds.length > 0 ? `WHERE channel_id IN (${placeholders(channelIds.length)})` : '';

    const rows = this.db
      .prepare(`SELECT status, COUNT(*) AS total FROM comments ${clause} GROUP BY status`)
      .all(...(channelIds as never[])) as unknown as Array<{ status: string; total: number }>;

    const counts = Object.fromEntries(
      COMMENT_STATUSES.map((status) => [status, 0]),
    ) as CommentCounts;

    for (const row of rows) {
      if ((COMMENT_STATUSES as string[]).includes(row.status)) {
        counts[row.status as CommentStatus] = Number(row.total);
      }
    }
    return counts;
  }

  /**
   * Rattrape les rattachements manquants.
   *
   * Un commentaire archivé sur une vidéo que la collecte n'avait pas encore ramenée reste
   * orphelin, et le resterait pour toujours si personne ne repassait dessus. C'est une
   * mise à jour indexée, rejouée après chaque collecte — l'ordre compte : les vidéos sont
   * collectées avant les commentaires, donc ce rattrapage ne concerne que les sorties
   * antérieures à la fenêtre.
   */
  linkVideos(channelId: string): number {
    const result = this.db
      .prepare(
        `UPDATE comments
            SET video_id = (SELECT v.id FROM videos v
                             WHERE v.channel_id = comments.channel_id
                               AND v.external_id = comments.video_external_id)
          WHERE channel_id = ?
            AND video_id IS NULL
            AND video_external_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM videos v
                         WHERE v.channel_id = comments.channel_id
                           AND v.external_id = comments.video_external_id)`,
      )
      .run(channelId);
    return Number(result.changes);
  }
}
