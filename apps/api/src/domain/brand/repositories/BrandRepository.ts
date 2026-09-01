import type { DateRange } from '../../metrics/repositories/MetricsRepository.ts';
import type { Brand, BrandStats, CreateBrandInput, UpdateBrandInput } from '../entities/Brand.ts';

export interface BrandFilter {
  includeArchived?: boolean;
}

export interface BrandStatsFilter {
  range: DateRange;
  /** Vide = toutes les chaînes (vue cumulée), comme partout ailleurs. */
  channelIds?: string[];
}

export interface BrandRepository {
  findAll(filter?: BrandFilter): Brand[];
  findById(id: string): Brand | null;
  create(input: CreateBrandInput): Brand;
  update(id: string, input: UpdateBrandInput): Brand;
  /** Refusée si des produits ou des sponsos sont rattachés : archiver plutôt. */
  delete(id: string): void;
  /** Classements du dashboard, une ligne par marque ayant quelque chose sur la période. */
  stats(filter: BrandStatsFilter): BrandStats[];
}
