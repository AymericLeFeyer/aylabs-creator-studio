import type { IsoDate } from '../../../shared/dates.ts';
import type { DateRange } from '../../metrics/repositories/MetricsRepository.ts';
import type {
  CreateRevenueEntryInput,
  RevenueEntry,
  RevenueEntryView,
  UpdateRevenueEntryInput,
} from '../entities/RevenueEntry.ts';

export interface RevenueEntryFilter {
  range?: DateRange;
  /** `undefined` = toutes les chaînes ; un tableau vide ne filtre pas non plus. */
  channelIds?: string[];
  categoryIds?: string[];
  /** Inclut aussi les revenus non rattachés à une chaîne. Défaut : true. */
  includeUnassigned?: boolean;
}

export interface RevenueEntryRepository {
  findAll(filter?: RevenueEntryFilter): RevenueEntryView[];
  findById(id: string): RevenueEntry | null;
  create(input: CreateRevenueEntryInput): RevenueEntry;
  update(id: string, input: UpdateRevenueEntryInput): RevenueEntry;
  delete(id: string): void;
  /** Somme par jour, par catégorie et par nature, pour construire les séries temporelles. */
  sumByDate(filter: RevenueEntryFilter): Array<{
    date: IsoDate;
    categoryId: string;
    nature: 'cash' | 'in_kind';
    totalCents: number;
  }>;
  /** Somme par catégorie sur la période, pour la répartition du dashboard. */
  sumByCategory(filter: RevenueEntryFilter): Array<{
    categoryId: string;
    totalCents: number;
  }>;
}
