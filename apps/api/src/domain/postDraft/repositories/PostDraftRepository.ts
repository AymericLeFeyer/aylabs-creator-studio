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
}
