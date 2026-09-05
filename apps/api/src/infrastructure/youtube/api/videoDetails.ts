import type { youtube_v3 } from 'googleapis';

/**
 * La fiche publique d'une vidéo : ce qui a été tapé dans le formulaire de mise en ligne.
 *
 * Distinct de `VideoStatRow`, qui porte les compteurs. Ces champs-là ne bougent presque
 * jamais et ne servent qu'à un geste ponctuel — reprendre la description de la sortie
 * précédente —, alors que les compteurs se rafraîchissent à chaque collecte.
 */
export interface VideoSnippet {
  externalId: string;
  title: string;
  description: string;
  tags: string[];
}

/**
 * Lit le `snippet` d'une vidéo, **à la demande**.
 *
 * Rien n'est stocké en base, et c'est délibéré : une description collectée à chaque
 * passage grossirait la base pour une donnée qu'on lit une fois par publication, et
 * surtout elle n'existerait que pour les vidéos parues **après** la migration — la
 * fenêtre de collecte ne remonte qu'à la dernière vidéo connue moins sept jours. Le
 * bouton « charger depuis la précédente » aurait donc paru cassé pendant des mois, sur
 * un catalogue pourtant complet. Un appel coûte 1 unité de quota.
 */
export const fetchVideoSnippet = async (
  client: youtube_v3.Youtube,
  externalId: string,
): Promise<VideoSnippet | null> => {
  const response = await client.videos.list({ part: ['snippet'], id: [externalId] });
  const item = response.data.items?.[0];
  if (!item?.id) return null;

  return {
    externalId: item.id,
    title: item.snippet?.title ?? '',
    description: item.snippet?.description ?? '',
    tags: item.snippet?.tags ?? [],
  };
};
