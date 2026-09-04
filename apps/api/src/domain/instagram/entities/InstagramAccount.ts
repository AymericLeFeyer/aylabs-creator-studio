import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Un compte Instagram **Business ou Creator**, relié à une Page Facebook.
 *
 * Un compte personnel ne donne accès à aucune statistique : l'API Graph ne répond qu'aux
 * comptes professionnels. C'est un prérequis absolu, pas une préférence, et l'écran de
 * réglages le dit plutôt que de laisser une collecte échouer sans explication.
 *
 * `accessToken` est un **jeton longue durée** (60 jours côté Meta, pas de jeton
 * perpétuel). Il est stocké en clair, comme le refresh token des chaînes, et **ne sort
 * jamais de l'API** — `toAccountView` le remplace par `hasToken`.
 */
export interface InstagramAccount {
  id: string;
  username: string;
  name: string | null;
  /** Identifiant du compte côté Meta, celui que tous les appels portent. */
  igUserId: string;
  accessToken: string | null;
  /**
   * Expiration du jeton. Meta n'en délivre pas d'éternel : sans cette date, la collecte
   * s'arrêterait un matin sans que rien ne l'ait annoncé.
   */
  tokenExpiresAt: string | null;
  profilePicture: string | null;
  color: string;
  isArchived: boolean;
  lastCollectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Ce que l'API renvoie : le jeton n'en fait pas partie. */
export interface InstagramAccountView extends Omit<InstagramAccount, 'accessToken'> {
  hasToken: boolean;
  /** Dernier relevé connu d'abonnés, pour l'afficher sans une requête de plus. */
  latestSnapshot: InstagramSnapshot | null;
  /** Jour du dernier flux enregistré, `null` si aucune collecte n'a rien écrit. */
  lastMetricDate: IsoDate | null;
  /**
   * Jours restants avant l'expiration du jeton, `null` si elle est inconnue.
   * Négatif = déjà expiré. C'est ce que l'écran affiche en alerte.
   */
  tokenDaysLeft: number | null;
}

export interface CreateInstagramAccountInput {
  username: string;
  name?: string | null;
  igUserId: string;
  accessToken?: string | null;
  tokenExpiresAt?: string | null;
  color?: string;
}

export type UpdateInstagramAccountInput = Partial<CreateInstagramAccountInput> & {
  isArchived?: boolean;
  profilePicture?: string | null;
  lastCollectedAt?: string | null;
};

/**
 * Un relevé quotidien du compte : **CUMUL**, pas flux.
 *
 * Sommer les abonnés de deux jours n'a aucun sens — même nature que `channel_snapshots`,
 * et même traitement : on prend la dernière valeur connue du bucket.
 */
export interface InstagramSnapshot {
  accountId: string;
  date: IsoDate;
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
}

/**
 * Les compteurs d'une journée : **FLUX**. Se somment dans le bucket et entre comptes.
 *
 * `reach` est la seule métrique que Meta rend en série quotidienne d'une traite ; les
 * autres sont des totaux qu'il faut demander jour par jour. D'où une fenêtre de
 * rattrapage courte : remonter trois mois coûterait quatre-vingt-dix requêtes par
 * métrique.
 */
export interface InstagramDailyMetric {
  accountId: string;
  date: IsoDate;
  reach: number | null;
  views: number | null;
  totalInteractions: number | null;
  accountsEngaged: number | null;
  profileLinksTaps: number | null;
}

/** Couleurs attribuées en rotation à la création, comme pour les chaînes et les marques. */
export const DEFAULT_IG_COLORS = [
  '#e1306c',
  '#f77737',
  '#833ab4',
  '#405de6',
  '#5851db',
  '#c13584',
] as const;
