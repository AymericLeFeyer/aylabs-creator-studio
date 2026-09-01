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
  /** Refuse en 409 une entrée générée par un produit ou une sponso. */
  update(id: string, input: UpdateRevenueEntryInput): RevenueEntry;
  delete(id: string): void;
  /**
   * Écriture et suppression **sans** la garde d'origine, réservées aux use cases de
   * synchronisation du module de production : ce sont eux qui possèdent ces lignes.
   */
  updateLinked(id: string, input: UpdateRevenueEntryInput): RevenueEntry;
  deleteLinked(id: string): void;
  /** Somme par jour, par catégorie et par nature, pour construire les séries temporelles. */
  sumByDate(filter: RevenueEntryFilter): Array<{
    date: IsoDate;
    categoryId: string;
    nature: 'cash' | 'in_kind';
    totalCents: number;
  }>;
  /** Nombre d'entrées en nature (produits reçus) sur la période, pas leur montant. */
  countInKind(filter: RevenueEntryFilter): number;
  /** Somme par catégorie sur la période, pour la répartition du dashboard. */
  sumByCategory(filter: RevenueEntryFilter): Array<{
    categoryId: string;
    totalCents: number;
  }>;
  /**
   * Somme par vidéo rattachée, séparée par nature. Volontairement **sans filtre de
   * date** : une sponso encaissée deux mois après la sortie appartient quand même à
   * cette vidéo, et le tableau de performance mesure la vidéo, pas la période.
   */
  sumByVideo(videoIds: string[]): Array<{
    videoId: string;
    cashCents: number;
    inKindCents: number;
  }>;
}
