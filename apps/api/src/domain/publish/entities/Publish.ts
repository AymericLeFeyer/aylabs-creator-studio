/**
 * La vidéo d'une publication de Production → Shorts, et ses envois vers chaque plateforme.
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
 * - `ready` : le conteneur Instagram est prêt, **rien n'est encore publié** — ou le
 *   brouillon TikTok est arrivé dans la boîte de réception de l'app ;
 * - `publishing` : la publication Instagram est demandée ;
 * - `published` : en ligne (en privé pour YouTube tant qu'on teste) ;
 * - `failed` : `error` dit pourquoi.
 */
export type PublishStatus =
  'uploading' | 'processing' | 'ready' | 'publishing' | 'published' | 'failed';

export type YouTubePrivacy = 'private' | 'unlisted' | 'public';

/**
 * TikTok : `draft` = brouillon dans la boîte de réception de l'app (on finit dans l'app) ;
 * `private` = publication directe en « Moi uniquement » (`SELF_ONLY`).
 */
export type TikTokMode = 'draft' | 'private';

/** Ce que porte la colonne `privacy` : la visibilité YouTube, ou le mode TikTok. */
export type PublishPrivacy = YouTubePrivacy | TikTokMode;

export interface PublishAttempt {
  id: string;
  uploadId: string;
  platform: PublishPlatform;
  /** La chaîne YouTube ou le compte Instagram visé. */
  targetId: string;
  targetName: string;
  status: PublishStatus;
  privacy: PublishPrivacy | null;
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
  /** Les comptes TikTok connectés (Paramètres → TikTok) ; `configured` = app TikTok renseignée. */
  tiktok: { configured: boolean; accounts: PublishTarget[] };
}

export interface CreateAttemptInput {
  uploadId: string;
  platform: PublishPlatform;
  targetId: string;
  targetName: string;
  status: PublishStatus;
  privacy?: PublishPrivacy | null;
  title?: string;
}

export interface UpdateAttemptInput {
  status?: PublishStatus;
  externalId?: string | null;
  url?: string | null;
  error?: string | null;
  thumbnailSetAt?: string | null;
}
