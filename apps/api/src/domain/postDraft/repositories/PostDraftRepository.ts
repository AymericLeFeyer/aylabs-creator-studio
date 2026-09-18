import type {
  CreatePostDraftInput,
  PostDraft,
  UpdatePostDraftInput,
} from '../entities/PostDraft.ts';

export interface PostDraftRepository {
  /**
   * Dans l'ordre du calendrier : la date prévue la plus proche en tête, les brouillons
   * sans date à la fin — même tri que la file de production.
   */
  findAll(): PostDraft[];
  findById(id: string): PostDraft | null;
  create(input: CreatePostDraftInput): PostDraft;
  update(id: string, input: UpdatePostDraftInput): PostDraft;
  delete(id: string): void;
}
