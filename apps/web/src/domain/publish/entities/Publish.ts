/**
 * Contrat de `/api/publish`, dupliqué de l'API.
 *
 * Banc d'essai de la publication directe (Production → Publish), **temporaire** : on y
 * glisse une vidéo, puis on l'envoie plateforme par plateforme pour valider chaque
 * branchement avant de les rattacher aux publications planifiées.
 *
 * Le fichier vit sur le disque (à côté de la base), jamais en BLOB : une vidéo pèse des
 * centaines de mégaoctets. `publicToken` est la clé de son adresse d'aperçu
 * (`/api/publish/files/<token>`). Aucune plateforme ne vient la chercher : le studio n'a
 * pas d'adresse publique, c'est **le serveur qui pousse** la vidéo à YouTube comme à
 * Instagram (upload reprenable).
 */
export interface PublishUpload {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  publicToken: string;
  createdAt: string;
}

export type PublishPlatform = 'youtube' | 'instagram' | 'tiktok';

/**
 * - `uploading` : le fichier part (YouTube) ou le conteneur se crée (Instagram) ;
 * - `processing` : la plateforme traite la vidéo (Instagram) ;
 * - `ready` : le conteneur Instagram est prêt, **rien n'est encore publié** ;
 * - `publishing` : la publication Instagram est demandée ;
 * - `published` : en ligne (en privé pour YouTube tant qu'on teste) ;
 * - `failed` : `error` dit pourquoi.
 */
export type PublishStatus =
  'uploading' | 'processing' | 'ready' | 'publishing' | 'published' | 'failed';

export type YouTubePrivacy = 'private' | 'unlisted' | 'public';

export interface PublishAttempt {
  id: string;
  uploadId: string;
  platform: PublishPlatform;
  /** La chaîne YouTube ou le compte Instagram visé. */
  targetId: string;
  targetName: string;
  status: PublishStatus;
  privacy: YouTubePrivacy | null;
  title: string;
  /** Identifiant de la vidéo YouTube, du conteneur puis du média Instagram. */
  externalId: string | null;
  url: string | null;
  error: string | null;
  /** YouTube : quand la miniature a été posée, `null` sinon. */
  thumbnailSetAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishUploadView extends PublishUpload {
  attempts: PublishAttempt[];
}

export interface PublishTarget {
  id: string;
  name: string;
  color: string;
}

/** Ce que l'écran peut viser, d'après la configuration déjà faite ailleurs. */
export interface PublishTargets {
  youtube: PublishTarget[];
  instagram: PublishTarget[];
  /**
   * Le stockage S3 éphémère est configuré : sans lui, Instagram est impossible (Meta
   * télécharge la vidéo à une adresse publique, que le studio n'a pas).
   */
  stagingConfigured: boolean;
  /** TikTok n'a encore aucune connexion : la raison s'affiche à l'écran. */
  tiktok: { available: false; reason: string };
}

/** Adresse de la vidéo, pour l'aperçu à l'écran. */
export const publishFileUrl = (upload: Pick<PublishUpload, 'publicToken'>): string =>
  `/api/publish/files/${upload.publicToken}`;

/** Un envoi encore en cours : l'écran relit la liste tant qu'il y en a un. */
export const isAttemptRunning = (attempt: PublishAttempt): boolean =>
  attempt.status === 'uploading' ||
  attempt.status === 'processing' ||
  attempt.status === 'publishing';

export const PUBLISH_STATUS_LABELS: Record<PublishStatus, string> = {
  uploading: 'Envoi…',
  processing: 'Traitement…',
  ready: 'Prêt, non publié',
  publishing: 'Publication…',
  published: 'Publié',
  failed: 'Échec',
};

export const PRIVACY_LABELS: Record<YouTubePrivacy, string> = {
  private: 'Privée',
  unlisted: 'Non répertoriée',
  public: 'Publique',
};

/** Une miniature générée (Production → Miniatures), ou une image en base64 (JPEG). */
export type YouTubeThumbnailSource = { thumbnailId: string } | { image: string };

export interface StartYouTubeInput {
  channelId: string;
  title: string;
  description: string;
  tags: string[];
  privacy: YouTubePrivacy;
  thumbnail?: YouTubeThumbnailSource;
}

export interface PrepareInstagramInput {
  accountId: string;
  caption: string;
  shareToFeed: boolean;
  /** Une image de couverture ; l'emporte sur `coverOffsetMs`. */
  coverImage?: YouTubeThumbnailSource;
  /** Sinon, une image prise dans la vidéo (ms). */
  coverOffsetMs?: number;
}
