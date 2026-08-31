/**
 * Contrat de `GET /api/videos`.
 *
 * Reflète `apps/api/src/domain/video/entities/Video.ts` : comme le reste du contrat,
 * les types sont redéclarés côté front plutôt que partagés dans un package.
 * Toute évolution doit être répercutée des deux côtés.
 */

export interface VideoStats {
  views: number;
  watchMinutes: number;
  subscribersGained: number;
  likes: number;
  comments: number;
  estimatedRevenueCents: number;
  /** `null` tant qu'aucune collecte n'a mesuré la vidéo : « — » plutôt que « 0 ». */
  updatedAt: string | null;
}

export interface Video {
  id: string;
  channelId: string;
  channelName: string;
  channelColor: string;
  externalId: string;
  title: string;
  publishedAt: string;
  date: string;
  thumbnailUrl: string | null;
  stats: VideoStats;
}

/** Lien public vers la vidéo, pour ouvrir la sortie depuis un tableau. */
export const youtubeUrl = (externalId: string): string =>
  `https://www.youtube.com/watch?v=${externalId}`;
