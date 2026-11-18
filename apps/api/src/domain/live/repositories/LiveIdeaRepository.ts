import type { IsoDate } from '../../../shared/dates.ts';
import type { CreateLiveIdeaInput, LiveIdea, UpdateLiveIdeaInput } from '../entities/LiveIdea.ts';

export interface LiveIdeaRepository {
  /** Les datées d'abord, la plus proche en tête ; puis les idées sans date, récentes d'abord. */
  findAll(): LiveIdea[];
  /** Les lives datés dans la période (bornes incluses), pour le planning. */
  findInRange(from: IsoDate, to: IsoDate): LiveIdea[];
  findById(id: string): LiveIdea | null;
  create(input: CreateLiveIdeaInput): LiveIdea;
  update(id: string, input: UpdateLiveIdeaInput): LiveIdea;
  delete(id: string): void;
}
