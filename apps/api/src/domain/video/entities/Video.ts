import type { IsoDate } from '../../../shared/dates.ts';
import type { Cents } from '../../../shared/money.ts';

/**
 * Compteurs propres à une vidéo, cumulés depuis sa sortie.
 *
 * Ce sont des CUMULS, pas des flux : ils ne s'additionnent jamais dans le temps,
 * chaque collecte remplace la valeur précédente. Ils cohabitent avec `daily_metrics`
 * sans jamais s'y mélanger — la somme des vues des vidéos d'une période ne vaut pas
 * les vues de la chaîne sur cette période (une vieille vidéo continue de tourner).
 */
export interface VideoStats {
  views: number;
  watchMinutes: number;
  /** Abonnés gagnés attribués à cette vidéo. Mode OAuth uniquement. */
  subscribersGained: number;
  likes: number;
  comments: number;
  /** AdSense estimé attribué à cette vidéo. Mode OAuth monétisé uniquement. */
  estimatedRevenueCents: Cents;
  /** `null` tant qu'aucune collecte n'a abouti : distingue « 0 vue » de « pas mesuré ». */
  updatedAt: string | null;
}

/**
 * Une vidéo publiée. Elle sert de **repère temporel** sur les graphiques (un trait au
 * jour de sortie) et de **porte-clé** : les revenus et dépenses peuvent s'y rattacher,
 * et la collecte y dépose ses compteurs pour le tableau de performance par vidéo.
 */
export interface Video {
  id: string;
  channelId: string;
  /** Identifiant YouTube de la vidéo (11 caractères). */
  externalId: string;
  title: string;
  /** Horodatage complet renvoyé par YouTube. */
  publishedAt: string;
  /** Jour de publication, en UTC comme le reste des séries. */
  date: IsoDate;
  thumbnailUrl: string | null;
  stats: VideoStats;
}

/** Vue enrichie du nom de la chaîne, pour les listes et les sélecteurs du front. */
export interface VideoView extends Video {
  channelName: string;
  channelColor: string;
}

export type UpsertVideoInput = Omit<Video, 'id' | 'stats'>;

/** Mise à jour des compteurs, adressée par la clé naturelle `(channelId, externalId)`. */
export interface VideoStatsUpdate {
  channelId: string;
  externalId: string;
  stats: Omit<VideoStats, 'updatedAt'>;
}

/**
 * Ce qu'une vidéo a fait **sur une période donnée**, reconstitué par différence entre
 * deux relevés de `video_stat_snapshots`.
 *
 * À ne pas confondre avec `VideoStats`, qui est un **cumul depuis la sortie**. Les deux
 * cohabitent volontairement : « cette vidéo a fait 40 000 vues » et « elle en a fait 800
 * le mois dernier » répondent à deux questions différentes, et c'est la seconde qui dit
 * ce que le catalogue rapporte encore.
 *
 * `undefined` (absence de la clé) signifie **pas mesurable** — il manque un relevé
 * antérieur à la période — et non « zéro ».
 */
export interface VideoRangeStats {
  views: number;
  watchMinutes: number;
  subscribersGained: number;
  estimatedRevenueCents: number;
}
