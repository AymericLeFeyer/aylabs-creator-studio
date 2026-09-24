import type { youtube_v3 } from 'googleapis';

/** `videos.list` n'accepte que 50 identifiants par appel. */
const MAX_IDS_PER_CALL = 50;

/** Durée maximale d'un Short depuis octobre 2024. */
const SHORT_MAX_SECONDS = 180;

/** Largeur demandée au lecteur intégré : c'est elle qui fait renvoyer le ratio. */
const PROBE_WIDTH = 1000;

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
 * L'API ne l'expose nulle part : ni la playlist « uploads », ni `videos.list` n'ont de
 * champ « short ». On le **déduit** de deux indices, tous deux lus en un seul appel
 * (1 unité de quota par lot de 50, quelles que soient les parties demandées) :
 *
 * - la **durée** (`contentDetails.duration`) — au-delà de trois minutes, ce n'en est pas un ;
 * - le **ratio** du lecteur intégré (`player.embedWidth/embedHeight`, renvoyés seulement
 *   quand on fixe `maxWidth`) — un Short est vertical ou carré.
 *
 * Les deux ensemble évitent de classer en Short une vidéo classique de deux minutes. Si
 * le ratio manque, la durée seule tranche : mieux vaut une vidéo courte rangée parmi les
 * Shorts qu'une colonne entière non classée.
 *
 * Une vidéo absente de la réponse (privée, supprimée) n'est pas dans le résultat : elle
 * reste non classée et sera redemandée au passage suivant.
 */
export const fetchVideoFormats = async (
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
