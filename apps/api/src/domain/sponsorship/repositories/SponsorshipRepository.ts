import type { IsoDate } from '../../../shared/dates.ts';
import type {
  CreateSponsorshipInput,
  Sponsorship,
  SponsorshipStatus,
  SponsorshipView,
  UpdateSponsorshipInput,
} from '../entities/Sponsorship.ts';

export interface SponsorshipFilter {
  statuses?: SponsorshipStatus[];
  brandIds?: string[];
  productionIds?: string[];
  channelIds?: string[];
  /** Fenêtre sur la date de paiement, pour les classements du dashboard. */
  paidRange?: { from: IsoDate; to: IsoDate };
}

export interface SponsorshipRepository {
  findAll(filter?: SponsorshipFilter): SponsorshipView[];
  findById(id: string): Sponsorship | null;
  create(input: CreateSponsorshipInput): Sponsorship;
  update(id: string, input: UpdateSponsorshipInput): Sponsorship;
  delete(id: string): void;
  setRevenueEntryId(id: string, revenueEntryId: string | null): void;
  /** Montants par production, pour les cartes de la file d'attente. */
  sumByProduction(): Array<{ productionId: string; total: number; pendingCents: number }>;
}
