import type { youtube_v3 } from 'googleapis';
import { toIsoDate } from '../../../shared/dates.ts';
import type { IsoDate } from '../../../shared/dates.ts';

export interface CommentItem {
  externalId: string;
  /** `null` sur un commentaire laissé sur la chaîne elle-même et non sous une vidéo. */
  videoExternalId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  authorChannelId: string | null;
  text: string;
  likeCount: number;
  publishedAt: string;
  date: IsoDate;
}

export interface FetchCommentsOptions {
  /** Identifiant de la chaîne dont on veut tous les commentaires. */
  channelId: string;
  /**
   * Dit si un commentaire est déjà archivé. C'est ce qui permet de s'arrêter tôt : une
   * page entièrement connue signifie qu'on a rejoint l'historique.
   */
  isKnown: (externalId: string) => boolean;
  /** Plafond de sécurité : 100 commentaires par page. */
  maxPages?: number;
}

/** Une page coûte 1 unité de quota. Vingt pages suffisent à rattraper une longue absence. */
const DEFAULT_MAX_PAGES = 20;

/**
 * Tous les commentaires récents d'une chaîne, du plus récent au plus ancien.
 *
 * On passe par `allThreadsRelatedToChannelId` et **non par une boucle sur les vidéos** :
 * une seule série d'appels couvre tout le catalogue, y compris les commentaires qui
 * tombent sur une sortie d'il y a deux ans — précisément ceux qu'une boucle bornée aux
 * vidéos récentes manquerait. Une page de 100 coûte 1 unité de quota, contre 1 unité
 * **par vidéo** pour l'autre chemin.
 *
 * Seuls les **commentaires de premier niveau** sont ramenés (`topLevelComment`). Les
 * réponses sont volontairement laissées de côté : sur un mur des commentaires, c'est le
 * message qu'on a écrit spontanément qui compte, pas l'échange qui a suivi — et la
 * plupart des réponses d'un fil sont les nôtres.
 *
 * **L'arrêt est anticipé.** On s'arrête dès qu'une page ne contient aucun commentaire
 * inconnu : l'ordre étant antéchronologique, tout ce qui suit est déjà archivé. Sans ça,
 * chaque passage horaire reparcourrait l'historique complet pour rien.
 */
export const fetchChannelComments = async (
  client: youtube_v3.Youtube,
  options: FetchCommentsOptions,
): Promise<CommentItem[]> => {
  const items: CommentItem[] = [];
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await client.commentThreads.list({
      part: ['snippet'],
      allThreadsRelatedToChannelId: options.channelId,
      order: 'time',
      // `plainText` et non `html` : le texte part dans un tableau et sur des cartes, et
      // afficher du HTML venu d'un inconnu n'a aucune raison d'être ici.
      textFormat: 'plainText',
      maxResults: 100,
      pageToken,
    });

    let unknownInPage = 0;

    for (const thread of response.data.items ?? []) {
      const top = thread.snippet?.topLevelComment;
      const snippet = top?.snippet;
      const externalId = top?.id;
      const publishedAt = snippet?.publishedAt;
      if (!externalId || !publishedAt) continue;

      if (!options.isKnown(externalId)) unknownInPage += 1;

      items.push({
        externalId,
        videoExternalId: thread.snippet?.videoId ?? null,
        authorName: snippet?.authorDisplayName ?? 'Anonyme',
        authorAvatarUrl: snippet?.authorProfileImageUrl ?? null,
        authorChannelId: snippet?.authorChannelId?.value ?? null,
        text: snippet?.textOriginal ?? snippet?.textDisplay ?? '',
        likeCount: Number(snippet?.likeCount ?? 0),
        publishedAt,
        date: toIsoDate(new Date(publishedAt)),
      });
    }

    pageToken = response.data.nextPageToken ?? undefined;
    // Une page vide n'est pas une page connue : on s'arrête faute de suite, pas parce
    // qu'on aurait rejoint l'historique.
    if (unknownInPage === 0 || !pageToken) break;
  }

  return items;
};
