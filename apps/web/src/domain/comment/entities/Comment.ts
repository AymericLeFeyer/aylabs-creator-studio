/** Contrat de `/api/comments`. Duplique celui de l'API : toute évolution va des deux côtés. */

export type CommentStatus = 'new' | 'encouraging' | 'idea' | 'ignored';

export const COMMENT_STATUSES: CommentStatus[] = ['new', 'encouraging', 'idea', 'ignored'];

/**
 * Les trois décisions qu'on peut prendre sur un commentaire, dans l'ordre des boutons.
 *
 * `new` n'en fait pas partie : ce n'est pas une décision mais l'absence de décision — la
 * file de tri. On y revient en re-cliquant le statut déjà posé, jamais par un quatrième
 * bouton qui ne dirait rien de plus.
 */
export const COMMENT_DECISIONS: Exclude<CommentStatus, 'new'>[] = [
  'encouraging',
  'idea',
  'ignored',
];

export const COMMENT_STATUS_LABELS: Record<CommentStatus, string> = {
  new: 'À trier',
  encouraging: 'Encourageant',
  idea: 'Idée',
  ignored: 'Ignoré',
};

/**
 * La couleur du badge d'un statut, en variante du design system.
 *
 * Elle vit ici, avec les libellés, pour la même raison qu'eux : trois écrans affichent le
 * même statut et trois teintes choisies à la main finiraient par se contredire.
 *
 * `encouraging` en vert — c'est ce qui part sur le mur ; `idea` en bleu, la couleur du
 * travail à venir dans tout l'outil ; `ignored` en simple contour — la ligne est close,
 * elle ne réclame plus rien ; `new` en gris, parce qu'elle n'a encore rien à dire.
 */
export const COMMENT_STATUS_BADGES: Record<
  CommentStatus,
  'secondary' | 'outline' | 'positive' | 'cash'
> = {
  new: 'secondary',
  encouraging: 'positive',
  idea: 'cash',
  ignored: 'outline',
};

export interface Comment {
  id: string;
  channelId: string;
  externalId: string;
  videoId: string | null;
  videoExternalId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  authorChannelId: string | null;
  text: string;
  likeCount: number;
  publishedAt: string;
  date: string;
  status: CommentStatus;
  curatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  channelName: string;
  channelColor: string;
  channelThumbnailUrl: string | null;
  /** `null` quand la vidéo n'a jamais été collectée : on retombe sur le lien YouTube. */
  videoTitle: string | null;
  videoThumbnailUrl: string | null;
}

export type CommentCounts = Record<CommentStatus, number>;

export interface CommentCollectResult {
  channelId: string;
  channelName: string;
  status: 'ok' | 'skipped' | 'error';
  found: number;
  created: number;
  linked: number;
  message?: string;
}

/** L'adresse publique d'un commentaire, pour aller y répondre sur YouTube. */
export const commentUrl = (comment: Comment): string | null =>
  comment.videoExternalId
    ? `https://www.youtube.com/watch?v=${comment.videoExternalId}&lc=${comment.externalId}`
    : null;

/**
 * Mélange une liste sans la modifier (Fisher-Yates).
 *
 * Le mur affiche les commentaires **au hasard** et non par date : trié, il raconterait
 * une chronologie — et les mêmes trois messages tiendraient le haut de la page pendant
 * des mois. Au hasard, chaque visite en remonte d'autres, et c'est tout l'intérêt d'en
 * garder deux cents.
 *
 * Le tirage vit côté écran plutôt que dans un `ORDER BY RANDOM()` : re-mélanger devient
 * instantané et ne coûte aucun aller-retour.
 */
export const shuffle = <T>(items: T[], seed: number): T[] => {
  const result = [...items];
  // Générateur déterministe (mulberry32) : à graine égale, même ordre. C'est ce qui évite
  // que le mur se réorganise tout seul à chaque rendu de React.
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
};
