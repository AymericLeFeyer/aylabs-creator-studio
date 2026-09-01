import type { IsoDate } from '../../../shared/dates.ts';
import type {
  CreateProductInput,
  Product,
  ProductStatus,
  ProductView,
  UpdateProductInput,
} from '../entities/Product.ts';

export interface ProductFilter {
  statuses?: ProductStatus[];
  brandIds?: string[];
  productionIds?: string[];
  sponsorshipIds?: string[];
  channelIds?: string[];
  /** Fenêtre sur la date de réception, pour les classements du dashboard. */
  receivedRange?: { from: IsoDate; to: IsoDate };
}

export interface ProductRepository {
  findAll(filter?: ProductFilter): ProductView[];
  findById(id: string): Product | null;
  create(input: CreateProductInput): Product;
  update(id: string, input: UpdateProductInput): Product;
  delete(id: string): void;
  /** Pose le lien vers le revenu généré, sans repasser par la validation d'écriture. */
  setRevenueEntryId(id: string, revenueEntryId: string | null): void;
  /** Compteurs par production, pour les cartes de la file d'attente. */
  countByProduction(): Array<{ productionId: string; total: number; pending: number }>;
}
