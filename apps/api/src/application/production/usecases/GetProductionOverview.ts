import { addDays, today } from '../../../shared/dates.ts';
import type { IsoDate } from '../../../shared/dates.ts';
import type {
  ProductionFormat,
  ProductionView,
} from '../../../domain/production/entities/Production.ts';
import type {
  ProductionAlert,
  ProductionOverview,
  ProductionStats,
} from '../../../domain/production/entities/ProductionOverview.ts';
import { entryMinutes } from '../../../domain/production/entities/TimeEntry.ts';
import type { SqliteTimeEntryRepository } from '../../../infrastructure/production/repositories/SqliteTimeEntryRepository.ts';
import type { ProductionStepRepository } from '../../../domain/production/repositories/ProductionRepository.ts';
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

/**
 * Combien de temps on rappelle qu'une vidéo est sortie avec des tâches non cochées.
 *
 * Publier à 80 % est une décision légitime — on sort, et on finit après : épingler le
 * commentaire, refaire la miniature, ranger les fichiers. Ce qui se perd, c'est le
 * **reste à faire**, invisible dès que la vidéo quitte la file d'attente.
 *
 * Trois semaines : assez pour revenir dessus, assez court pour que l'alerte s'efface
 * d'elle-même. Sans borne, chaque vieille sortie inachevée resterait au tableau pour
 * toujours et noierait les échéances qui, elles, sont urgentes.
 */
const PUBLISHED_REVIEW_DAYS = 21;

/** Au-delà, la liste des tâches restantes ne se lit plus : on annonce le reste. */
const MAX_LISTED_TODOS = 4;

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
  private readonly steps: ProductionStepRepository;
  private readonly times: SqliteTimeEntryRepository;

  constructor(
    productions: ProductionRepository,
    slots: ProductionSlotRepository,
    products: ProductRepository,
    sponsorships: SponsorshipRepository,
    steps: ProductionStepRepository,
    times: SqliteTimeEntryRepository,
  ) {
    this.productions = productions;
    this.slots = slots;
    this.products = products;
    this.sponsorships = sponsorships;
    this.steps = steps;
    this.times = times;
  }

  /**
   * `format` borne la file, ses chiffres et ses créneaux à un seul menu (« Vidéos » ou
   * « Shorts & Réels »).
   *
   * Les **alertes**, elles, portent toujours sur tout : ce sont elles qui alimentent les
   * pastilles de **tous** les menus, et chacune est étiquetée de son format
   * (`productionFormat`) pour que l'écran garde les siennes. Les filtrer ici obligerait le
   * menu à lancer autant de requêtes qu'il a de pastilles.
   */
  execute(format?: ProductionFormat): ProductionOverview {
    const now = today();
    const fullQueue = this.productions.findAll({ statuses: ['idea', 'in_progress', 'paused'] });
    const queue = format ? fullQueue.filter((p) => p.format === format) : fullQueue;
    // Une seule lecture complète, partagée par les alertes : elles ont besoin des
    // publiées (celles qui ont une sortie rattachée) autant que de la file.
    const all = this.productions.findAll();

    // La prochaine à travailler est la première qui n'attend pas quelqu'un d'autre.
    // Si tout est en pause, on retombe sur la tête de file plutôt que sur rien.
    const next = queue.find((p) => p.status !== 'paused') ?? queue[0] ?? null;

    const upcomingSlots = this.slots
      .findAll({
        range: { from: now, to: addDays(now, 14) },
        includeDone: false,
      })
      .filter((slot) => !format || slot.productionFormat === format);

    const weekEnd = addDays(now, 6);
    const weekLoadMinutes = upcomingSlots
      .filter((slot) => slot.date <= weekEnd)
      .reduce((total, slot) => total + slotMinutes(slot), 0);

    return {
      queue,
      nextId: next?.id ?? null,
      alerts: this.buildAlerts(now, fullQueue, all),
      upcomingSlots,
      weekLoadMinutes,
      stats: this.buildStats(now, queue, format, all),
      running: this.times.findRunning(),
    };
  }

  /**
   * Les chiffres du bandeau, tous dérivés de la file déjà chargée.
   *
   * L'avancement moyen compte **une étape et une tâche du même poids** : c'est la règle
   * annoncée par la barre de progression d'une carte, et deux pondérations différentes
   * feraient dire deux choses au même écran.
   */
  /**
   * `queue` est déjà bornée au format ; le temps passé, lui, vient des sessions de
   * travail, qui ne portent que leur production. `all` sert à retrouver le format de
   * chacune — publiées comprises, puisqu'on a pu travailler cette semaine sur une vidéo
   * sortie hier.
   */
  private buildStats(
    now: IsoDate,
    queue: ProductionView[],
    format: ProductionFormat | undefined,
    all: ProductionView[],
  ): ProductionStats {
    const formats = new Map(all.map((production) => [production.id, production.format]));
    const weekEnd = addDays(now, 6);
    const stepsCount = this.steps.findAll().length;

    const dated = queue
      .filter((production) => production.plannedDate !== null)
      .sort((a, b) => (a.plannedDate! < b.plannedDate! ? -1 : 1));
    const nextRelease = dated.find((production) => production.plannedDate! >= now) ?? null;

    const progressOf = (production: ProductionView): number => {
      const total = stepsCount + production.todos.length;
      if (total === 0) return 0;
      const done = production.steps.length + production.todos.filter((todo) => todo.checked).length;
      return Math.min(1, done / total);
    };

    // Le chronomètre en cours compte dans le total de la semaine : sinon le chiffre
    // resterait figé pendant qu'on travaille, exactement quand on le regarde.
    const weekTrackedMinutes = this.times
      .findAll({ from: addDays(now, -6), to: now })
      .filter((entry) => !format || formats.get(entry.productionId) === format)
      .reduce((total, entry) => total + entryMinutes(entry), 0);

    return {
      inQueue: queue.length,
      inProgress: queue.filter((production) => production.status === 'in_progress').length,
      paused: queue.filter((production) => production.status === 'paused').length,
      dueThisWeek: dated.filter(
        (production) => production.plannedDate! >= now && production.plannedDate! <= weekEnd,
      ).length,
      late: dated.filter((production) => production.plannedDate! < now).length,
      nextRelease: nextRelease
        ? { id: nextRelease.id, title: nextRelease.title, date: nextRelease.plannedDate! }
        : null,
      weekTrackedMinutes,
      averageProgress:
        queue.length === 0
          ? 0
          : queue.reduce((total, production) => total + progressOf(production), 0) / queue.length,
    };
  }

  private buildAlerts(
    now: IsoDate,
    queue: ProductionView[],
    all: ProductionView[],
  ): ProductionAlert[] {
    const alerts: ProductionAlert[] = [];
    const soon = addDays(now, DEADLINE_WARNING_DAYS);

    // Le format de chaque production, pour ranger les alertes de produit et de sponso
    // rattachés dans le bon menu.
    const formats = new Map(all.map((production) => [production.id, production.format]));
    const formatOf = (productionId: string | null): ProductionFormat | null =>
      productionId ? (formats.get(productionId) ?? null) : null;

    // Sortie dans moins d'une semaine, et rien n'a commencé — ou tout est bloqué.
    //
    // C'est l'alerte qui compte le plus dans la file, parce qu'elle est la seule qui dise
    // « il n'y a déjà plus le temps » : une vidéo à l'état d'idée à six jours de sa sortie
    // ne sortira pas sans qu'on décide quelque chose aujourd'hui. Une date déjà dépassée y
    // entre aussi — c'est le même cas, en pire. `danger`, donc pastille rouge et carte
    // rouge dans la file.
    //
    // « Commencée » se lit au **statut** et non aux cases cochées : `idea` est
    // précisément « notée, pas commencée », et une vidéo en pause n'avance pas plus.
    const urgentIds = new Set<string>();
    for (const production of queue) {
      if (production.status !== 'idea' && production.status !== 'paused') continue;
      if (!production.plannedDate || production.plannedDate >= soon) continue;
      urgentIds.add(production.id);
      const delta = daysBetween(now, production.plannedDate);
      const when =
        delta < 0
          ? 'Sortie dépassée'
          : delta === 0
            ? "Sortie aujourd'hui"
            : `Sortie dans ${plural(delta, 'jour')}`;
      alerts.push({
        kind: 'production_urgent',
        severity: 'danger',
        title: `${when}, ${production.status === 'paused' ? 'en pause' : 'pas commencée'} : ${production.title}`,
        detail:
          production.status === 'paused'
            ? (production.pausedReason ?? 'En pause, aucune raison notée')
            : "Encore à l'état d'idée",
        date: production.plannedDate,
        productionId: production.id,
        productionFormat: production.format,
        productId: null,
        sponsorshipId: null,
      });
    }

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
        productionFormat: formatOf(product.productionId),
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
        productionFormat: formatOf(sponsorship.productionId),
        productId: null,
        sponsorshipId: sponsorship.id,
      });
    }

    // Payée mais rien en ligne : c'est la situation qui coûte le plus cher en confiance.
    //
    // « En ligne » se lit exactement comme la synchronisation des revenus : la sortie
    // vient du rattachement DIRECT (`videoId`, une vidéo déjà publiée importée depuis
    // YouTube) ou, à défaut, de celui de la production. Ne regarder que la production
    // faisait crier au retard sur une sponso rattachée à une vidéo pourtant en ligne.
    const publishedProductionIds = new Set(all.filter((p) => p.videoId).map((p) => p.id));
    const isDelivered = (sponsorship: { videoId: string | null; productionId: string | null }) =>
      sponsorship.videoId !== null ||
      (sponsorship.productionId !== null && publishedProductionIds.has(sponsorship.productionId));

    for (const sponsorship of this.sponsorships.findAll({ statuses: ['paid'] })) {
      if (isDelivered(sponsorship)) continue;
      alerts.push({
        kind: 'sponsorship_undelivered',
        severity: 'warning',
        title: `Sponso payée, vidéo pas encore publiée : ${sponsorship.label}`,
        detail: `${sponsorship.brandName ?? 'Sans marque'} — encaissée le ${sponsorship.paidAt ?? '—'}`,
        date: sponsorship.paidAt,
        productionId: sponsorship.productionId,
        productionFormat: formatOf(sponsorship.productionId),
        productId: null,
        sponsorshipId: sponsorship.id,
      });
    }

    // La vidéo livrée dont l'argent n'est pas arrivé. C'est le seul statut de sponso qui
    // coûte de l'argent si on l'oublie, et il n'a pas d'échéance à dépasser : tant qu'il
    // est là, il y a une relance à faire. Aucun montant dans le texte — le masquage de
    // confidentialité ne s'applique pas à une phrase.
    for (const sponsorship of this.sponsorships.findAll({ statuses: ['awaiting_payment'] })) {
      alerts.push({
        kind: 'sponsorship_awaiting_payment',
        severity: 'warning',
        title: `Paiement en attente : ${sponsorship.label}`,
        detail: `${sponsorship.brandName ?? 'Sans marque'} — vidéo livrée, à relancer`,
        date: sponsorship.deadline,
        productionId: sponsorship.productionId,
        productionFormat: formatOf(sponsorship.productionId),
        productId: null,
        sponsorshipId: sponsorship.id,
      });
    }

    for (const production of queue) {
      if (production.status !== 'paused' || !production.pausedAt) continue;
      // Déjà signalée comme urgente : la même carte ne doit pas crier deux fois.
      if (urgentIds.has(production.id)) continue;
      const days = daysBetween(production.pausedAt.slice(0, 10), now);
      if (days < STALLED_DAYS) continue;
      alerts.push({
        kind: 'production_stalled',
        severity: 'warning',
        title: `En pause depuis ${plural(days, 'jour')} : ${production.title}`,
        detail: production.pausedReason ?? 'Aucune raison notée',
        date: production.pausedAt.slice(0, 10),
        productionId: production.id,
        productionFormat: production.format,
        productId: null,
        sponsorshipId: null,
      });
    }

    // Publiée alors qu'il restait du travail coché nulle part.
    //
    // C'est un cas **volontaire** — on sort à 80 % et on finit après —, et c'est
    // précisément pour ça qu'il mérite une alerte : la vidéo quitte la file d'attente le
    // jour de sa sortie, et son reste à faire disparaît de l'écran avec elle. Sans ce
    // rappel, la miniature à refaire et le commentaire à épingler ne se retrouvent qu'en
    // rouvrant une fiche qu'on n'a plus aucune raison d'ouvrir.
    //
    // `warning` et jamais `danger` : rien n'est en retard, c'est du travail qui traîne.
    const stepNames = new Map(this.steps.findAll(true).map((step) => [step.id, step.name]));

    for (const production of all) {
      // La date de sortie **réelle** borne le rappel ; `plannedDate` la remplace quand la
      // vidéo a été marquée publiée sans rattachement à une sortie collectée.
      const published = production.videoDate ?? production.plannedDate;
      if (production.status !== 'done' || !published) continue;
      if (daysBetween(published, now) > PUBLISHED_REVIEW_DAYS) continue;

      // Les tâches d'abord : ce sont elles, les « sous-étapes » qu'on cherche. Une étape
      // sans aucune tâche n'a rien de plus fin à montrer, elle compte pour elle-même.
      const checkedSteps = new Set(production.steps.map((step) => step.stepId));
      const pending = production.todos
        .filter((todo) => !todo.checked)
        .map((todo) =>
          todo.stepId && stepNames.has(todo.stepId)
            ? `${stepNames.get(todo.stepId)} · ${todo.label}`
            : todo.label,
        );

      for (const [stepId, name] of stepNames) {
        if (checkedSteps.has(stepId)) continue;
        if (production.todos.some((todo) => todo.stepId === stepId)) continue;
        pending.push(name);
      }

      if (pending.length === 0) continue;

      const listed = pending.slice(0, MAX_LISTED_TODOS);
      const rest = pending.length - listed.length;
      alerts.push({
        kind: 'production_incomplete',
        severity: 'warning',
        title: `Publiée avec ${plural(pending.length, 'tâche')} non cochée${pending.length > 1 ? 's' : ''} : ${production.title}`,
        detail: rest > 0 ? `${listed.join(', ')} — et ${rest} autre(s)` : listed.join(', '),
        date: published,
        productionId: production.id,
        productionFormat: production.format,
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
