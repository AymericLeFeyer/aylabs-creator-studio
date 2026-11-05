/**
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
  /** TikTok n'a encore aucune connexion : la raison s'affiche à l'écran. */
  tiktok: { available: false; reason: string };
}

export interface CreateAttemptInput {
  uploadId: string;
  platform: PublishPlatform;
  targetId: string;
  targetName: string;
  status: PublishStatus;
  privacy?: YouTubePrivacy | null;
  title?: string;
}

export interface UpdateAttemptInput {
  status?: PublishStatus;
  externalId?: string | null;
  url?: string | null;
  error?: string | null;
}
