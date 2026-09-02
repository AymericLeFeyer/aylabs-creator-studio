import type { IsoDate } from '../../../shared/dates.ts';
import type {
  CreateRequirementInput,
  CreateSponsorshipInput,
  Sponsorship,
  SponsorshipRequirement,
  SponsorshipStatus,
  SponsorshipView,
  UpdateRequirementInput,
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

  /** Les plans à filmer d'une sponso, dans l'ordre du cahier des charges. */
  findRequirements(sponsorshipId: string): SponsorshipRequirement[];
  addRequirement(sponsorshipId: string, input: CreateRequirementInput): SponsorshipRequirement;
  updateRequirement(id: string, input: UpdateRequirementInput): SponsorshipRequirement;
  deleteRequirement(id: string): void;
}
