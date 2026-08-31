import type { IsoDate } from '../../../shared/dates.ts';
import type { DateRange } from '../../metrics/repositories/MetricsRepository.ts';
import type {
  CreateExpenseEntryInput,
  ExpenseEntry,
  ExpenseEntryView,
  UpdateExpenseEntryInput,
} from '../entities/ExpenseEntry.ts';

export interface ExpenseEntryFilter {
  range?: DateRange;
  channelIds?: string[];
  categoryIds?: string[];
  includeUnassigned?: boolean;
}

export interface ExpenseRepository {
  findAll(filter?: ExpenseEntryFilter): ExpenseEntryView[];
  findById(id: string): ExpenseEntry | null;
  create(input: CreateExpenseEntryInput): ExpenseEntry;
  update(id: string, input: UpdateExpenseEntryInput): ExpenseEntry;
  delete(id: string): void;
  /** Somme par jour et par catégorie, pour construire les séries temporelles. */
  sumByDate(filter: ExpenseEntryFilter): Array<{
    date: IsoDate;
    categoryId: string;
    totalCents: number;
  }>;
  /** Somme par catégorie sur la période, pour la répartition du dashboard. */
  sumByCategory(filter: ExpenseEntryFilter): Array<{ categoryId: string; totalCents: number }>;
  /** Somme par vidéo rattachée, sans filtre de date (voir `RevenueEntryRepository.sumByVideo`). */
  sumByVideo(videoIds: string[]): Array<{ videoId: string; totalCents: number }>;
}
