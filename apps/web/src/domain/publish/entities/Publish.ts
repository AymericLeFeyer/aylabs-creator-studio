/**
 * Contrat de `/api/publish`, dupliqué de l'API : la mise en ligne de la vidéo d'une
 * publication (Production → Shorts) sur YouTube, Instagram et TikTok.
 */

export type PublishPlatform = 'youtube' | 'instagram' | 'tiktok';

/** Les plateformes d'un short, dans l'ordre d'affichage. Les trois par défaut. */
export const SHORT_PLATFORMS: readonly PublishPlatform[] = ['youtube', 'instagram', 'tiktok'];

export const PLATFORM_LABELS: Record<PublishPlatform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

/**
 * - `uploading` : le fichier part ; `processing` : la plateforme le traite ;
 * - `ready` : TikTok — la vidéo est dans la boîte de réception de l'app, à finir là-bas ;
 * - `publishing` : la publication Instagram est demandée ;
 * - `published` : en ligne ; `failed` : `error` dit pourquoi.
 */
export type PublishStatus =
  'uploading' | 'processing' | 'ready' | 'publishing' | 'published' | 'failed';

export interface PublishAttempt {
  id: string;
  uploadId: string;
  platform: PublishPlatform;
  /** La chaîne YouTube, le compte Instagram ou la connexion TikTok visés. */
  targetId: string;
  targetName: string;
  status: PublishStatus;
  privacy: string | null;
  title: string;
  externalId: string | null;
  url: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishTarget {
  id: string;
  name: string;
  color: string;
}

/** Ce que la mise en ligne peut viser, d'après la configuration déjà faite ailleurs. */
export interface PublishTargets {
  youtube: PublishTarget[];
  instagram: PublishTarget[];
  /**
   * Le stockage S3 éphémère est configuré : sans lui, Instagram est impossible (Meta
   * télécharge la vidéo à une adresse publique, que le studio n'a pas).
   */
  stagingConfigured: boolean;
  /** Comptes TikTok connectés (Paramètres → TikTok) ; `configured` = app TikTok renseignée. */
  tiktok: { configured: boolean; accounts: PublishTarget[] };
}

/** Un envoi encore en cours : l'écran relit la liste tant qu'il y en a un. */
export const isAttemptRunning = (attempt: PublishAttempt): boolean =>
  attempt.status === 'uploading' ||
  attempt.status === 'processing' ||
  attempt.status === 'publishing';

const STATUS_LABELS: Record<PublishStatus, string> = {
  uploading: 'Envoi…',
  processing: 'Traitement…',
  ready: 'Prêt',
  publishing: 'Publication…',
  published: 'En ligne',
  failed: 'Échec',
};

/** Un brouillon TikTok « prêt » est arrivé dans l'app : on le finit sur le téléphone. */
export const attemptStatusLabel = (attempt: PublishAttempt): string =>
  attempt.platform === 'tiktok' && attempt.status === 'ready'
    ? 'Dans ta boîte TikTok'
    : STATUS_LABELS[attempt.status];

/**
 * Pourquoi une plateforme ne peut pas partir, `null` si elle peut. La première cible sert
 * (YouTube préfère la chaîne de la vidéo d'origine, côté API).
 */
export const platformBlocker = (
  platform: PublishPlatform,
  targets: PublishTargets | undefined,
): string | null => {
  if (!targets) return null;
  if (platform === 'youtube') {
    return targets.youtube.length ? null : 'Aucune chaîne en OAuth (Paramètres → YouTube)';
  }
  if (platform === 'instagram') {
    if (!targets.instagram.length) return 'Aucun compte à jeton (Paramètres → Instagram)';
    return targets.stagingConfigured ? null : 'Stockage PUBLISH_S3_* absent de la configuration';
  }
  if (!targets.tiktok.configured) return 'App TikTok absente (TIKTOK_CLIENT_KEY)';
  return targets.tiktok.accounts.length ? null : 'Aucun compte connecté (Paramètres → TikTok)';
};

/** Le compte qui recevra la vidéo, pour le dire avant de programmer. */
export const platformTargetName = (
  platform: PublishPlatform,
  targets: PublishTargets | undefined,
): string | null => {
  if (!targets) return null;
  const list =
    platform === 'youtube'
      ? targets.youtube
      : platform === 'instagram'
        ? targets.instagram
        : targets.tiktok.accounts;
  return list[0]?.name ?? null;
};
