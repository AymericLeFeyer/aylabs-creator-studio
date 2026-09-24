import type { youtube_v3 } from 'googleapis';

/** `videos.list` n'accepte que 50 identifiants par appel. */
const MAX_IDS_PER_CALL = 50;

/** Durée maximale d'un Short depuis octobre 2024 (repli seulement). */
const SHORT_MAX_SECONDS = 180;

/** Largeur demandée au lecteur intégré : c'est elle qui fait renvoyer le ratio. */
const PROBE_WIDTH = 1000;

/**
 * Plafond de pages par playlist et par passage : 2 000 vidéos. Le premier classement d'un
 * gros catalogue peut donc demander plusieurs collectes ; les suivants trouvent les
 * nouveautés dès la première page, la liste étant antéchronologique.
 */
const MAX_PAGES = 40;

/**
 * Les playlists automatiques de YouTube, dérivées de la playlist d'envois (`UU…`) en
 * changeant son préfixe : `UUSH…` = l'onglet « Shorts » de la chaîne, `UULF…` = l'onglet
 * « Vidéos » (hors Shorts et hors directs). C'est l'équivalent API de `@chaine/videos` et
 * `@chaine/shorts`, sans lire de HTML.
 */
const FORMAT_PLAYLISTS: Array<{ prefix: string; isShort: boolean }> = [
  { prefix: 'UUSH', isShort: true },
  { prefix: 'UULF', isShort: false },
];

export interface VideoFormatsOptions {
  /** Identifiant de chaîne (mode clé API). Ignoré si `mine` est vrai. */
  channelId?: string;
  /** Mode OAuth : la chaîne du compte qui a accordé le token. */
  mine?: boolean;
}

/** `PT1H2M3S` → 3723. `null` si la chaîne n'est pas lisible (direct en cours, `P0D`…). */
const parseIsoDuration = (value: string | null | undefined): number | null => {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value ?? '');
  if (!match) return null;
  const [, d, h, m, s] = match.map((part) => Number(part ?? 0));
  return d! * 86_400 + h! * 3_600 + m! * 60 + s!;
};

/**
 * Dit, pour chaque vidéo, si c'est un Short.
 *
 * **Par l'appartenance aux onglets de la chaîne**, lue dans les playlists `UUSH` / `UULF`
 * (`FORMAT_PLAYLISTS`) : c'est YouTube lui-même qui range, et c'est exact — une règle de
 * durée et de ratio classait de travers un Short de trois minutes en 16:9 ou une vidéo
 * verticale de deux minutes. La pagination s'arrête dès que toutes les vidéos demandées
 * sont trouvées.
 *
 * Ces playlists ne sont **pas documentées** : si l'une répond une erreur (introuvable,
 * format changé), on continue sans elle. Ce qui n'a été trouvé nulle part — une vidéo
 * privée, non listée, un direct, ou les playlists indisponibles — retombe sur l'ancienne
 * **règle durée + ratio** (`classifyByShape`). Une vidéo absente de toutes les réponses
 * reste non classée et sera redemandée au passage suivant.
 */
export const fetchVideoFormats = async (
  client: youtube_v3.Youtube,
  videoIds: string[],
  options: VideoFormatsOptions,
): Promise<Map<string, boolean>> => {
  const result = new Map<string, boolean>();
  const pending = new Set(videoIds);
  if (pending.size === 0) return result;

  const uploads = await uploadsPlaylistId(client, options);
  if (uploads) {
    const suffix = uploads.slice(2);
    for (const { prefix, isShort } of FORMAT_PLAYLISTS) {
      if (pending.size === 0) break;
      try {
        await scanPlaylist(
          client,
          `${prefix}${suffix}`,
          (videoId) => {
            if (!pending.has(videoId)) return;
            result.set(videoId, isShort);
            pending.delete(videoId);
          },
          () => pending.size === 0,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[collect] playlist ${prefix} indisponible : ${message}`);
      }
    }
  }

  if (pending.size > 0) {
    for (const [videoId, isShort] of await classifyByShape(client, [...pending])) {
      result.set(videoId, isShort);
    }
  }

  return result;
};

const uploadsPlaylistId = async (
  client: youtube_v3.Youtube,
  options: VideoFormatsOptions,
): Promise<string | null> => {
  if (!options.mine && options.channelId?.startsWith('UC')) {
    // Pas d'appel : la playlist d'envois d'une chaîne `UC…` est `UU…`.
    return `UU${options.channelId.slice(2)}`;
  }
  const response = await client.channels.list(
    options.mine
      ? { part: ['contentDetails'], mine: true }
      : { part: ['contentDetails'], id: [options.channelId ?? ''] },
  );
  return response.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
};

const scanPlaylist = async (
  client: youtube_v3.Youtube,
  playlistId: string,
  onVideo: (videoId: string) => void,
  done: () => boolean,
): Promise<void> => {
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await client.playlistItems.list({
      part: ['contentDetails'],
      playlistId,
      maxResults: 50,
      pageToken,
    });
    for (const item of response.data.items ?? []) {
      const videoId = item.contentDetails?.videoId;
      if (videoId) onVideo(videoId);
    }
    pageToken = response.data.nextPageToken ?? undefined;
    if (done() || !pageToken) return;
  }
};

/**
 * Le repli : **durée** ≤ 3 min **et** lecteur vertical ou carré (`player.embedWidth/Height`,
 * renvoyés seulement quand on fixe `maxWidth`). Sans ratio, la durée seule tranche.
 */
const classifyByShape = async (
  client: youtube_v3.Youtube,
  videoIds: string[],
): Promise<Map<string, boolean>> => {
  const result = new Map<string, boolean>();

  for (let offset = 0; offset < videoIds.length; offset += MAX_IDS_PER_CALL) {
    const batch = videoIds.slice(offset, offset + MAX_IDS_PER_CALL);
    const response = await client.videos.list({
      part: ['contentDetails', 'player'],
      id: batch,
      maxWidth: PROBE_WIDTH,
    });

    for (const item of response.data.items ?? []) {
      if (!item.id) continue;
      const seconds = parseIsoDuration(item.contentDetails?.duration);
      if (seconds === null) continue;

      const width = Number(item.player?.embedWidth ?? 0);
      const height = Number(item.player?.embedHeight ?? 0);
      const vertical = width > 0 && height > 0 ? height >= width : true;

      result.set(item.id, seconds > 0 && seconds <= SHORT_MAX_SECONDS && vertical);
    }
  }

  return result;
};
