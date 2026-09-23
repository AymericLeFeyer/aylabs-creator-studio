import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Un compte TikTok suivi **par son profil public**, sans API officielle ni jeton — même
 * parti pris que l'ancien profil public Instagram (avant le passage à l'API Graph) :
 * TikTok n'ouvre son API `Display`/`Content Posting` qu'à des partenaires validés, hors de
 * portée d'un studio individuel. Le compte est créé tout seul au premier relevé, depuis le
 * nom d'utilisateur renseigné dans Paramètres → API.
 */
export interface TikTokAccount {
  id: string;
  username: string;
  name: string | null;
  profilePicture: string | null;
  color: string;
  isArchived: boolean;
  /** Compte dans `/api/export` (Paramètres → API), indépendamment de l'archivage. */
  exportEnabled: boolean;
  lastCollectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TikTokAccountView extends TikTokAccount {
  latestSnapshot: TikTokSnapshot | null;
}

export type UpdateTikTokAccountInput = Partial<
  Pick<TikTokAccount, 'username' | 'name' | 'color' | 'isArchived' | 'exportEnabled'>
> & {
  profilePicture?: string | null;
  lastCollectedAt?: string | null;
};

/**
 * Un relevé quotidien : **CUMUL**, pas flux — même nature que `channel_snapshots` et
 * `ig_account_snapshots`. Sommer les abonnés de deux jours n'a aucun sens ; on prend la
 * dernière valeur connue du bucket.
 */
export interface TikTokSnapshot {
  accountId: string;
  date: IsoDate;
  followersCount: number | null;
  followingCount: number | null;
  /** Total des cœurs (j'aime) reçus sur toutes les vidéos, cumulatif. */
  heartCount: number | null;
  videoCount: number | null;
}

/** Une vidéo publique archivée, avec ses compteurs au moment du relevé. */
export interface TikTokVideo {
  id: string;
  accountId: string;
  /** Identifiant TikTok de la vidéo. */
  videoId: string;
  description: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  postedAt: string;
  date: IsoDate;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  /** `null` tant qu'aucune collecte n'a mesuré la vidéo. */
  statsAt: string | null;
}

/**
 * Ce que dit le **profil public** d'un compte, lu sans jeton ni compte développeur.
 *
 * Une seule voie de lecture (`source` vaut toujours `'json'`, contrairement à Instagram
 * qui en tente plusieurs) : la page ne sert aucune balise Open Graph exploitable, tout
 * vient du JSON du rendu serveur. Ses chiffres sont des **entiers exacts**, jamais
 * arrondis — `approximate` vaut donc toujours `false`. `recentVideos` reste souvent vide :
 * aucun nombre total de vidéos fiable n'existe, le relevé du compte
 * (`TikTokSnapshot.videoCount`) se contente donc du nombre de vidéos **listées**, un
 * plancher plutôt qu'un total exact.
 */
export interface TikTokPublicProfile {
  username: string;
  fullName: string | null;
  profilePicture: string | null;
  followers: number | null;
  following: number | null;
  hearts: number | null;
  source: 'json';
  approximate: boolean;
  recentVideos: TikTokPublicVideo[];
}

export interface TikTokPublicVideo {
  id: string;
  description: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  postedAt: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

/** Couleurs attribuées en rotation à la création, comme pour les chaînes et les marques. */
export const DEFAULT_TIKTOK_COLORS = [
  '#000000',
  '#69c9d0',
  '#ee1d52',
  '#25f4ee',
  '#fe2c55',
] as const;
