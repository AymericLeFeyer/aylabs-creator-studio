import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Une story, telle qu'on a réussi à l'attraper.
 *
 * **C'est la raison d'être de ce module.** L'API n'expose les stories que pendant leurs
 * 24 heures de vie — ni archivées, ni à la une, ni par aucun autre point d'entrée. « Combien
 * de stories ai-je publiées ce mois-ci » n'est donc pas une question qu'on peut poser
 * rétroactivement : c'est une question à laquelle on ne peut répondre que si on a archivé
 * au fil de l'eau.
 *
 * Conséquences pratiques, toutes assumées :
 *
 * - **L'historique commence à la première collecte**, exactement comme
 *   `video_stat_snapshots`. Aucun rattrapage n'est possible, jamais.
 * - **Une journée sans collecte est perdue pour de bon.** Le cron horaire couvre
 *   largement la fenêtre de 24 h, mais un serveur arrêté une journée entière laisse un
 *   trou définitif.
 * - `insightsAt` à `null` distingue « pas encore mesurée » de « zéro vue ». Il reste à
 *   `null` pour de bon sur une story vue par **moins de cinq comptes** : Meta refuse
 *   alors toute statistique. L'écran affiche « — », jamais 0.
 */
export interface InstagramStory {
  id: string;
  accountId: string;
  igMediaId: string;
  mediaType: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  /** Horodatage complet renvoyé par l'API. */
  postedAt: string;
  /** Jour de publication, clé de tous les comptages. */
  date: IsoDate;
  views: number | null;
  reach: number | null;
  replies: number | null;
  /** `null` = jamais mesurée. Voir la remarque sur les cinq vues. */
  insightsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertStoryInput {
  accountId: string;
  igMediaId: string;
  mediaType: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  postedAt: string;
  date: IsoDate;
}

export interface StoryInsightsInput {
  views: number | null;
  reach: number | null;
  replies: number | null;
}

/**
 * Une publication : post, carrousel ou reel.
 *
 * Contrairement aux stories, elles sont **rattrapables** — Meta garde deux ans de
 * métriques média. Une base neuve peut donc afficher tout l'historique dès la première
 * collecte, ce qui n'arrivera jamais pour les stories.
 */
export interface InstagramMedia {
  id: string;
  accountId: string;
  igMediaId: string;
  mediaType: string | null;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  postedAt: string;
  date: IsoDate;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
  /** `null` tant qu'aucune collecte n'a mesuré la publication : l'écran affiche « — ». */
  statsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertMediaInput {
  accountId: string;
  igMediaId: string;
  mediaType: string | null;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  postedAt: string;
  date: IsoDate;
}

export interface MediaInsightsInput {
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
}
