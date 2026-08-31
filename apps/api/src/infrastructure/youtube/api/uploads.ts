import type { youtube_v3 } from 'googleapis';
import { toIsoDate } from '../../../shared/dates.ts';
import type { IsoDate } from '../../../shared/dates.ts';
import { upstream } from '../../../shared/errors.ts';

export interface UploadItem {
  externalId: string;
  title: string;
  publishedAt: string;
  date: IsoDate;
  thumbnailUrl: string | null;
}

export interface FetchUploadsOptions {
  /** Identifiant de chaîne (mode clé API). Ignoré si `mine` est vrai. */
  channelId?: string;
  /** Mode OAuth : la chaîne du compte qui a accordé le token. */
  mine?: boolean;
  /** On ne remonte pas au-delà de cette date. */
  since: IsoDate;
  /** Plafond de sécurité : 50 vidéos par page. */
  maxPages?: number;
}

const DEFAULT_MAX_PAGES = 20;

/**
 * Liste les vidéos publiées d'une chaîne, de la plus récente à la plus ancienne.
 *
 * On passe par la playlist « uploads » de la chaîne plutôt que par `search.list` :
 * une page coûte 1 unité de quota contre 100 pour une recherche, et l'ordre y est
 * garanti antéchronologique — ce qui permet de s'arrêter dès qu'on dépasse `since`.
 *
 * Les Shorts en font partie : YouTube ne les distingue pas ici, et les séparer
 * demanderait un appel de plus par lot de vidéos.
 */
export const fetchUploads = async (
  client: youtube_v3.Youtube,
  options: FetchUploadsOptions,
): Promise<UploadItem[]> => {
  const channelResponse = await client.channels.list(
    options.mine
      ? { part: ['contentDetails'], mine: true }
      : { part: ['contentDetails'], id: [options.channelId ?? ''] },
  );

  const playlistId = channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) throw upstream("Playlist d'uploads introuvable pour cette chaîne");

  const items: UploadItem[] = [];
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await client.playlistItems.list({
      part: ['snippet', 'contentDetails'],
      playlistId,
      maxResults: 50,
      pageToken,
    });

    let reachedLimit = false;

    for (const item of response.data.items ?? []) {
      const externalId = item.contentDetails?.videoId;
      // `videoPublishedAt` est la date de mise en ligne ; `snippet.publishedAt` serait
      // la date d'ajout à la playlist. Absent sur une vidéo privée ou supprimée.
      const publishedAt = item.contentDetails?.videoPublishedAt;
      if (!externalId || !publishedAt) continue;

      const date = toIsoDate(new Date(publishedAt));
      if (date < options.since) {
        reachedLimit = true;
        break;
      }

      items.push({
        externalId,
        title: item.snippet?.title ?? 'Sans titre',
        publishedAt,
        date,
        thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? null,
      });
    }

    pageToken = response.data.nextPageToken ?? undefined;
    if (reachedLimit || !pageToken) break;
  }

  return items;
};
