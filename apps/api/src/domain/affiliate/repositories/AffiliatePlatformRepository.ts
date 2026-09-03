import type { DateRange } from '../../metrics/repositories/MetricsRepository.ts';
import type {
  AffiliatePlatform,
  AffiliatePlatformView,
  CreateAffiliatePlatformInput,
  UpdateAffiliatePlatformInput,
} from '../entities/AffiliatePlatform.ts';

export interface AffiliatePlatformRepository {
  /**
   * Les plateformes, avec leurs marques et leurs gains.
   * `range` borne `earnedCents` ; `totalEarnedCents` l'ignore toujours.
   */
  findAll(options?: { includeArchived?: boolean; range?: DateRange }): AffiliatePlatformView[];
  findById(id: string): AffiliatePlatform | null;
  create(input: CreateAffiliatePlatformInput): AffiliatePlatform;
  update(id: string, input: UpdateAffiliatePlatformInput): AffiliatePlatform;
  /** Les revenus rattachés sont **détachés**, jamais supprimés. */
  delete(id: string): void;
}
