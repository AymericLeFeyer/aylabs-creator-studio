import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Ce qu'on décide d'un commentaire, et c'est la seule chose que l'outil y ajoute.
 *
 * `new` n'est pas un quatrième tiroir mais la **file de tri** : tout ce que la collecte
 * dépose y atterrit, et l'écran n'a rien d'autre à faire que de la vider. Le distinguer
 * d'`ignored` est ce qui permet de dire « il me reste 40 commentaires à regarder » plutôt
 * que de relire chaque jour ceux qu'on a déjà écartés.
 *
 * La catégorisation est **manuelle**, volontairement : un modèle qui se trompe met une
 * critique sur le mur des commentaires, et c'est exactement ce qu'un mur ne pardonne pas.
 * Le jour où elle sera automatique, elle proposera un statut — elle ne l'imposera pas.
 */
export type CommentStatus = 'new' | 'encouraging' | 'idea' | 'ignored';

export const COMMENT_STATUSES: CommentStatus[] = ['new', 'encouraging', 'idea', 'ignored'];

/**
 * Un commentaire laissé sous une vidéo, archivé au fil de l'eau.
 *
 * **Il est archivé parce qu'il ne se retrouve pas.** L'API ne rend les commentaires que
 * par pages antéchronologiques, et retrouver « celui qui m'avait fait plaisir en mars »
 * six mois plus tard demanderait de tout reparcourir. Une fois la ligne écrite, elle ne
 * dépend plus de YouTube — et le statut qu'on lui a donné non plus.
 *
 * `videoId` est le rattachement à notre table `videos`, `videoExternalId` l'identifiant
 * YouTube brut. Les deux cohabitent : un commentaire tombe souvent sur une vidéo plus
 * ancienne que la fenêtre de collecte, qui n'a donc aucune ligne chez nous. Le premier
 * peut rester `null` pour toujours, le second jamais — c'est lui qui permet le lien vers
 * YouTube quand on n'a pas mieux.
 */
export interface Comment {
  id: string;
  channelId: string;
  /** Identifiant YouTube du commentaire. Clé de dédoublonnage avec `channelId`. */
  externalId: string;
  videoId: string | null;
  videoExternalId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  /** Chaîne de l'auteur, pour reconnaître (et écarter) ses propres réponses. */
  authorChannelId: string | null;
  text: string;
  likeCount: number;
  /** Horodatage complet renvoyé par YouTube. */
  publishedAt: string;
  /** Jour de publication, en UTC comme le reste des séries. */
  date: IsoDate;
  status: CommentStatus;
  /** Quand on a tranché. `null` tant que le commentaire est dans la file de tri. */
  curatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Vue enrichie : tout ce qu'une ligne de tableau ou une carte du mur affiche.
 *
 * Le titre de la vidéo vient d'une jointure et non d'une colonne dénormalisée : un titre
 * changé après coup doit suivre, et `commentThreads` ne le renvoie de toute façon pas.
 */
export interface CommentView extends Comment {
  channelName: string;
  channelColor: string;
  channelThumbnailUrl: string | null;
  /** `null` quand la vidéo n'a jamais été collectée : l'écran retombe sur le lien YouTube. */
  videoTitle: string | null;
  videoThumbnailUrl: string | null;
}

/** Ce que la collecte dépose. Le statut n'en fait pas partie : il n'appartient qu'à nous. */
export interface UpsertCommentInput {
  channelId: string;
  externalId: string;
  videoExternalId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  authorChannelId: string | null;
  text: string;
  likeCount: number;
  publishedAt: string;
  date: IsoDate;
}

/** Compte par statut, pour les pastilles des onglets sans charger les lignes. */
export type CommentCounts = Record<CommentStatus, number>;
