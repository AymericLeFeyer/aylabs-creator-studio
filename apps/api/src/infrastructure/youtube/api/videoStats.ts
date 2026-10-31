import type { youtube_v3 } from 'googleapis';
import type { Cents } from '../../../shared/money.ts';

/**
 * Compteurs d'une vidéo tels que YouTube les renvoie, cumulés depuis sa sortie.
 * Les champs indisponibles selon la source valent 0 (voir `fetchPublicVideoStats`).
 */
export interface VideoStatRow {
  externalId: string;
  views: number;
  watchMinutes: number;
  subscribersGained: number;
  likes: number;
  comments: number;
  estimatedRevenueCents: Cents;
}

/** `videos.list` n'accepte que 50 identifiants par appel. */
const MAX_IDS_PER_CALL = 50;

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Statistiques publiques d'une liste de vidéos (mode clé API).
 *
 * Ne donne que ce que tout le monde voit : vues, likes, commentaires. Les abonnés
 * gagnés et les revenus restent à zéro — ils n'existent que dans YouTube Analytics,
 * donc en mode OAuth. Le front distingue les deux cas par `stats.updatedAt`.
 */
export const fetchPublicVideoStats = async (
  client: youtube_v3.Youtube,
  videoIds: string[],
): Promise<VideoStatRow[]> => {
  const rows: VideoStatRow[] = [];

  for (let offset = 0; offset < videoIds.length; offset += MAX_IDS_PER_CALL) {
    const batch = videoIds.slice(offset, offset + MAX_IDS_PER_CALL);
    const response = await client.videos.list({ part: ['statistics'], id: batch });

    for (const item of response.data.items ?? []) {
      if (!item.id) continue;
      rows.push({
        externalId: item.id,
        views: num(item.statistics?.viewCount),
        watchMinutes: 0,
        subscribersGained: 0,
        likes: num(item.statistics?.likeCount),
        comments: num(item.statistics?.commentCount),
        estimatedRevenueCents: 0,
      });
    }
  }

  return rows;
};

/**
 * Pose les compteurs publics par-dessus ceux de YouTube Analytics.
 *
 * Analytics a jusqu'à trois jours de retard : sur une vidéo qui vient de sortir il ne
 * renvoie rien, ou presque, alors que `videos.list` est à jour à quelques minutes près.
 * Vues, likes et commentaires viennent donc du plus avancé des deux ; minutes vues,
 * abonnés gagnés et revenus n'existent que dans Analytics. Une vidéo qu'Analytics ne
 * connaît pas encore garde sa ligne publique, sinon elle resterait « pas encore mesurée ».
 */
export const overlayPublicStats = (
  analytics: VideoStatRow[],
  publicRows: VideoStatRow[],
): VideoStatRow[] => {
  const merged = new Map(publicRows.map((row) => [row.externalId, row]));
  for (const row of analytics) {
    const live = merged.get(row.externalId);
    merged.set(
      row.externalId,
      live
        ? {
            ...row,
            views: Math.max(row.views, live.views),
            likes: Math.max(row.likes, live.likes),
            comments: Math.max(row.comments, live.comments),
          }
        : row,
    );
  }
  return [...merged.values()];
};
