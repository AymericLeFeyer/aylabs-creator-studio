import { addDays, today } from '../../../shared/dates.ts';
import type { IsoDate } from '../../../shared/dates.ts';
import type { ProductionView } from '../../../domain/production/entities/Production.ts';
import type {
  ProductionAlert,
  ProductionOverview,
} from '../../../domain/production/entities/ProductionOverview.ts';
import { slotMinutes } from '../../../domain/production/entities/ProductionSlot.ts';
import type {
  ProductionRepository,
  ProductionSlotRepository,
} from '../../../domain/production/repositories/ProductionRepository.ts';
import { PENDING_PRODUCT_STATUSES } from '../../../domain/product/entities/Product.ts';
import type { ProductRepository } from '../../../domain/product/repositories/ProductRepository.ts';
import type { SponsorshipRepository } from '../../../domain/sponsorship/repositories/SponsorshipRepository.ts';

/** Une échéance à moins de ce nombre de jours passe en alerte. */
const DEADLINE_WARNING_DAYS = 7;

/** Au-delà, une vidéo en pause n'est plus « en attente » mais oubliée. */
const STALLED_DAYS = 14;

const daysBetween = (a: IsoDate, b: IsoDate): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const plural = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * Le tableau de bord de la production : la file d'attente, ce qui cloche, et les
 * rapprochements possibles avec les sorties déjà collectées.
 *
 * Tout est calculé côté API pour que la règle d'alerte n'existe qu'à un seul endroit —
 * le front ne fait qu'afficher ce qu'on lui donne, dans l'ordre reçu.
 */
export class GetProductionOverview {
  private readonly productions: ProductionRepository;
  private readonly slots: ProductionSlotRepository;
  private readonly products: ProductRepository;
  private readonly sponsorships: SponsorshipRepository;

  constructor(
    productions: ProductionRepository,
    slots: ProductionSlotRepository,
    products: ProductRepository,
    sponsorships: SponsorshipRepository,
  ) {
    this.productions = productions;
    this.slots = slots;
    this.products = products;
    this.sponsorships = sponsorships;
  }

  execute(): ProductionOverview {
    const now = today();
    const queue = this.productions.findAll({ statuses: ['idea', 'in_progress', 'paused'] });

    // La prochaine à travailler est la première qui n'attend pas quelqu'un d'autre.
    // Si tout est en pause, on retombe sur la tête de file plutôt que sur rien.
    const next = queue.find((p) => p.status !== 'paused') ?? queue[0] ?? null;

    const upcomingSlots = this.slots.findAll({
      range: { from: now, to: addDays(now, 14) },
      includeDone: false,
    });

    const weekEnd = addDays(now, 6);
    const weekLoadMinutes = upcomingSlots
      .filter((slot) => slot.date <= weekEnd)
      .reduce((total, slot) => total + slotMinutes(slot), 0);

    return {
      queue,
      nextId: next?.id ?? null,
      alerts: this.buildAlerts(now, queue),
      upcomingSlots,
      weekLoadMinutes,
    };
  }

  private buildAlerts(now: IsoDate, queue: ProductionView[]): ProductionAlert[] {
    const alerts: ProductionAlert[] = [];
    const soon = addDays(now, DEADLINE_WARNING_DAYS);

    for (const product of this.products.findAll({ statuses: PENDING_PRODUCT_STATUSES })) {
      if (!product.deadline || product.deadline > soon) continue;
      const late = product.deadline < now;
      alerts.push({
        kind: 'product_late',
        severity: late ? 'danger' : 'warning',
        title: late ? `Produit en retard : ${product.name}` : `Produit attendu : ${product.name}`,
        detail: `${product.brandName ?? 'Sans marque'} — échéance ${late ? 'dépassée' : 'proche'}`,
        date: product.deadline,
        productionId: product.productionId,
        productId: product.id,
        sponsorshipId: null,
      });
    }

    for (const sponsorship of this.sponsorships.findAll({ statuses: ['todo', 'in_progress'] })) {
      if (!sponsorship.deadline || sponsorship.deadline > soon) continue;
      const late = sponsorship.deadline < now;
      alerts.push({
        kind: 'sponsorship_due',
        severity: late ? 'danger' : 'warning',
        title: late
          ? `Sponso en retard : ${sponsorship.label}`
          : `Sponso à livrer : ${sponsorship.label}`,
        detail: `${sponsorship.brandName ?? 'Sans marque'} — ${sponsorship.productionTitle ?? 'aucune vidéo rattachée'}`,
        date: sponsorship.deadline,
        productionId: sponsorship.productionId,
        productId: null,
        sponsorshipId: sponsorship.id,
      });
    }

    // Payée mais rien en ligne : c'est la situation qui coûte le plus cher en confiance.
    const publishedProductionIds = new Set(
      this.productions
        .findAll()
        .filter((p) => p.videoId)
        .map((p) => p.id),
    );
    for (const sponsorship of this.sponsorships.findAll({ statuses: ['paid'] })) {
      if (sponsorship.productionId && publishedProductionIds.has(sponsorship.productionId)) {
        continue;
      }
      alerts.push({
        kind: 'sponsorship_undelivered',
        severity: 'warning',
        title: `Sponso payée, vidéo pas encore publiée : ${sponsorship.label}`,
        detail: `${sponsorship.brandName ?? 'Sans marque'} — encaissée le ${sponsorship.paidAt ?? '—'}`,
        date: sponsorship.paidAt,
        productionId: sponsorship.productionId,
        productId: null,
        sponsorshipId: sponsorship.id,
      });
    }

    for (const production of queue) {
      if (production.status !== 'paused' || !production.pausedAt) continue;
      const days = daysBetween(production.pausedAt.slice(0, 10), now);
      if (days < STALLED_DAYS) continue;
      alerts.push({
        kind: 'production_stalled',
        severity: 'warning',
        title: `En pause depuis ${plural(days, 'jour')} : ${production.title}`,
        detail: production.pausedReason ?? 'Aucune raison notée',
        date: production.pausedAt.slice(0, 10),
        productionId: production.id,
        productId: null,
        sponsorshipId: null,
      });
    }

    // Le plus urgent d'abord, puis la date la plus ancienne : l'ordre de lecture.
    return alerts.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'danger' ? -1 : 1;
      return (a.date ?? '9999').localeCompare(b.date ?? '9999');
    });
  }
}
