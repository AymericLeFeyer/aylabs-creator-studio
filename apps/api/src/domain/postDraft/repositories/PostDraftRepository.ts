import type {
  CreatePostDraftInput,
  PostDraft,
  PostDraftSummary,
  UpdatePostDraftInput,
} from '../entities/PostDraft.ts';

export interface PostDraftRepository {
  /**
   * La liste (`archived: false`) dans l'ordre du calendrier : la date prévue la plus proche
   * en tête, les brouillons sans date à la fin. Les archives, elles, du plus récemment
   * archivé au plus ancien.
   */
  findAll(options?: { archived?: boolean }): PostDraft[];
  /** Toutes les publications tirées d'une vidéo, archivées comprises, par date prévue. */
  findByProduction(productionId: string): PostDraft[];
  findById(id: string): PostDraft | null;
  summary(): PostDraftSummary;
  create(input: CreatePostDraftInput): PostDraft;
  update(id: string, input: UpdatePostDraftInput): PostDraft;
  delete(id: string): void;
  /** Rattache (ou détache, `null`) une vidéo déposée. Rend l'ancienne, à effacer. */
  setVideo(id: string, uploadId: string | null): { previousUploadId: string | null };
  /** Les publications prêtes dont l'heure est passée (`now`, instant UTC). */
  findDue(now: string): PostDraft[];
  /**
   * Pose `publish_started_at` **si elle ne l'était pas** : rend `false` si une autre
   * mise en ligne l'a précédée. C'est la seule garde contre un double envoi.
   */
  markStarted(id: string, at: string): boolean;
  /** La couverture (JPEG), `null` s'il n'y en a pas. */
  cover(id: string): { data: Buffer; mimeType: string } | null;
  setCover(id: string, image: { data: Buffer; mimeType: string } | null): void;
  /** Les dépôts rattachés à une publication (pour effacer les autres au démarrage). */
  linkedUploadIds(): Set<string>;
}
