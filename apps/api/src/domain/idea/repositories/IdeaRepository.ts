import type { ProductionFormat } from '../../production/entities/Production.ts';
import type { CreateIdeaInput, Idea, UpdateIdeaInput } from '../entities/Idea.ts';

export interface IdeaRepository {
  /**
   * La plus récente en tête : on relit d'abord ce qu'on vient de noter. `format` borne au
   * carnet d'un seul menu ; absent, les deux.
   */
  findAll(format?: ProductionFormat): Idea[];
  findById(id: string): Idea | null;
  create(input: CreateIdeaInput): Idea;
  update(id: string, input: UpdateIdeaInput): Idea;
  delete(id: string): void;
}
