import { today } from '../../../shared/dates.ts';
import { SPONSOR_CATEGORY_ID } from '../../../domain/category/entities/Category.ts';
import type {
  CreateRequirementInput,
  CreateSponsorshipInput,
  Sponsorship,
  SponsorshipRequirement,
  UpdateRequirementInput,
  UpdateSponsorshipInput,
} from '../../../domain/sponsorship/entities/Sponsorship.ts';
import type { SponsorshipRepository } from '../../../domain/sponsorship/repositories/SponsorshipRepository.ts';
import type { BrandRepository } from '../../../domain/brand/repositories/BrandRepository.ts';
import type { ProductionRepository } from '../../../domain/production/repositories/ProductionRepository.ts';
import type { RevenueEntryRepository } from '../../../domain/revenue/repositories/RevenueRepository.ts';
import { notFound } from '../../../shared/errors.ts';

/**
 * Écritures de sponsos, **et** le revenu cash qui va avec.
 *
 * Même règle que pour les produits, à la nature près : **une sponso `paid` a une entrée
 * de revenu cash, toutes les autres n'en ont pas.** Une sponso signée mais pas encaissée
 * ne doit surtout pas apparaître dans le chiffre d'affaires — elle est comptée à part,
 * dans le « à encaisser » du dashboard.
 */
export class ManageSponsorships {
  private readonly sponsorships: SponsorshipRepository;
  private readonly productions: ProductionRepository;
  private readonly brands: BrandRepository;
  private readonly revenues: RevenueEntryRepository;

  constructor(
    sponsorships: SponsorshipRepository,
    productions: ProductionRepository,
    brands: BrandRepository,
    revenues: RevenueEntryRepository,
  ) {
    this.sponsorships = sponsorships;
    this.productions = productions;
    this.brands = brands;
    this.revenues = revenues;
  }

  create(input: CreateSponsorshipInput): Sponsorship {
    return this.sync(this.sponsorships.create(input));
  }

  update(id: string, input: UpdateSponsorshipInput): Sponsorship {
    return this.sync(this.sponsorships.update(id, input));
  }

  remove(id: string): void {
    const existing = this.sponsorships.findById(id);
    if (!existing) throw notFound('Sponso');
    if (existing.revenueEntryId) this.revenues.deleteLinked(existing.revenueEntryId);
    this.sponsorships.delete(id);
  }

  /**
   * Les plans à filmer exigés par la marque.
   *
   * Ils passent par ce use case comme tout le reste, alors qu'ils **n'ont aucun effet
   * sur le revenu** : les routes ne parlent jamais directement au dépôt des sponsos, et
   * une exception ici serait le premier chemin d'écriture qu'on oublierait de vérifier
   * le jour où un plan coché voudra dire quelque chose de plus.
   */
  addRequirement(sponsorshipId: string, input: CreateRequirementInput): SponsorshipRequirement {
    return this.sponsorships.addRequirement(sponsorshipId, input);
  }

  updateRequirement(id: string, input: UpdateRequirementInput): SponsorshipRequirement {
    return this.sponsorships.updateRequirement(id, input);
  }

  removeRequirement(id: string): void {
    this.sponsorships.deleteRequirement(id);
  }

  /** Re-synchronise toutes les sponsos d'une production (sa chaîne ou sa vidéo a changé). */
  resyncProduction(productionId: string): void {
    for (const sponsorship of this.sponsorships.findAll({ productionIds: [productionId] })) {
      const fresh = this.sponsorships.findById(sponsorship.id);
      if (fresh) this.sync(fresh);
    }
  }

  private sync(sponsorship: Sponsorship): Sponsorship {
    const shouldExist = sponsorship.status === 'paid' && sponsorship.amountCents !== 0;

    if (!shouldExist) {
      if (!sponsorship.revenueEntryId) return sponsorship;
      this.revenues.deleteLinked(sponsorship.revenueEntryId);
      this.sponsorships.setRevenueEntryId(sponsorship.id, null);
      return { ...sponsorship, revenueEntryId: null };
    }

    // Même règle que pour les produits : un rattachement direct à une sortie publiée
    // l'emporte sur celui de la production.
    const production = sponsorship.productionId
      ? this.productions.findById(sponsorship.productionId)
      : null;
    const brand = sponsorship.brandId ? this.brands.findById(sponsorship.brandId) : null;

    const payload = {
      channelId: sponsorship.channelId ?? production?.channelId ?? null,
      categoryId: SPONSOR_CATEGORY_ID,
      videoId: sponsorship.videoId ?? production?.videoId ?? null,
      date: sponsorship.paidAt ?? today(),
      amountCents: sponsorship.amountCents,
      label: brand ? `${brand.name} — ${sponsorship.label}` : sponsorship.label,
      notes: production ? `Sponso de « ${production.title} »` : 'Sponso',
      origin: 'sponsorship' as const,
    };

    if (sponsorship.revenueEntryId) {
      this.revenues.updateLinked(sponsorship.revenueEntryId, payload);
      return sponsorship;
    }

    const entry = this.revenues.create(payload);
    this.sponsorships.setRevenueEntryId(sponsorship.id, entry.id);
    return { ...sponsorship, revenueEntryId: entry.id };
  }
}
