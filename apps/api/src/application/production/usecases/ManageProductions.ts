import type {
  CreateProductionInput,
  Production,
  UpdateProductionInput,
} from '../../../domain/production/entities/Production.ts';
import { PUBLISH_STEP_ID } from '../../../domain/production/entities/ProductionStep.ts';
import type {
  ProductionRepository,
  ProductionStepRepository,
} from '../../../domain/production/repositories/ProductionRepository.ts';
import type { ProductRepository } from '../../../domain/product/repositories/ProductRepository.ts';
import type { SponsorshipRepository } from '../../../domain/sponsorship/repositories/SponsorshipRepository.ts';
import type { ManageProducts } from '../../product/usecases/ManageProducts.ts';
import type { ManageSponsorships } from '../../sponsorship/usecases/ManageSponsorships.ts';
import { conflict, notFound } from '../../../shared/errors.ts';

/**
 * Écritures de productions.
 *
 * La production est le porteur de la chaîne et de la vidéo : quand l'une des deux
 * change, **tous les revenus générés par ses produits et ses sponsos doivent suivre**,
 * sinon une sponso resterait rattachée à l'ancienne vidéo et fausserait son tableau de
 * performance. C'est la seule raison d'être de ce use case par-dessus le dépôt.
 */
export class ManageProductions {
  private readonly productions: ProductionRepository;
  private readonly steps: ProductionStepRepository;
  private readonly products: ProductRepository;
  private readonly sponsorships: SponsorshipRepository;
  private readonly manageProducts: ManageProducts;
  private readonly manageSponsorships: ManageSponsorships;

  constructor(
    productions: ProductionRepository,
    steps: ProductionStepRepository,
    products: ProductRepository,
    sponsorships: SponsorshipRepository,
    manageProducts: ManageProducts,
    manageSponsorships: ManageSponsorships,
  ) {
    this.productions = productions;
    this.steps = steps;
    this.products = products;
    this.sponsorships = sponsorships;
    this.manageProducts = manageProducts;
    this.manageSponsorships = manageSponsorships;
  }

  create(input: CreateProductionInput): Production {
    return this.productions.create(input);
  }

  update(id: string, input: UpdateProductionInput): Production {
    const before = this.productions.findById(id);
    if (!before) throw notFound('Production');

    const after = this.productions.update(id, input);

    if (before.channelId !== after.channelId || before.videoId !== after.videoId) {
      this.resync(id);
    }
    return after;
  }

  /**
   * Supprime la production. Ses produits et ses sponsos ne partent pas avec elle
   * (`ON DELETE SET NULL`) : ils sont détachés, puis re-synchronisés — leurs revenus
   * doivent perdre le rattachement à la vidéo qui vient de disparaître.
   */
  remove(id: string): void {
    const productIds = this.products.findAll({ productionIds: [id] }).map((p) => p.id);
    const sponsorshipIds = this.sponsorships.findAll({ productionIds: [id] }).map((s) => s.id);

    this.productions.delete(id);

    for (const productId of productIds) this.manageProducts.update(productId, {});
    for (const sponsorshipId of sponsorshipIds) this.manageSponsorships.update(sponsorshipId, {});
  }

  /**
   * Marque la production publiée : rattache la sortie réelle, coche l'étape de
   * publication et passe en terminé. La vidéo quitte alors la file d'attente sans que
   * rien ne soit perdu — script, créneaux et argent restent consultables.
   */
  publish(id: string, videoId: string): Production {
    const existing = this.productions.findById(id);
    if (!existing) throw notFound('Production');

    const claimed = this.productions.findAll().find((p) => p.videoId === videoId && p.id !== id);
    if (claimed) {
      throw conflict(`Cette sortie est déjà rattachée à « ${claimed.title} ».`);
    }

    const published = this.productions.update(id, { videoId, status: 'done' });

    // L'étape peut avoir été supprimée : la publication reste valable sans elle.
    if (this.steps.findById(PUBLISH_STEP_ID)) {
      this.productions.checkStep(id, PUBLISH_STEP_ID);
    }
    this.resync(id);

    return published;
  }

  private resync(productionId: string): void {
    this.manageProducts.resyncProduction(productionId);
    this.manageSponsorships.resyncProduction(productionId);
  }
}
