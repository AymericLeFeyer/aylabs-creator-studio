import type { CreateIdeaInput, Idea, UpdateIdeaInput } from '../entities/Idea.ts';

export interface IdeaRepository {
  /** La plus récente en tête : on relit d'abord ce qu'on vient de noter. */
  findAll(): Idea[];
  findById(id: string): Idea | null;
  create(input: CreateIdeaInput): Idea;
  update(id: string, input: UpdateIdeaInput): Idea;
  delete(id: string): void;
}
