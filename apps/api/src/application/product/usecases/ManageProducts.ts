import { today } from '../../../shared/dates.ts';
import { IN_KIND_CATEGORY_ID } from '../../../domain/category/entities/Category.ts';
import type {
  CreateProductInput,
  Product,
  UpdateProductInput,
} from '../../../domain/product/entities/Product.ts';
import type { ProductRepository } from '../../../domain/product/repositories/ProductRepository.ts';
import type { BrandRepository } from '../../../domain/brand/repositories/BrandRepository.ts';
import type { ProductionRepository } from '../../../domain/production/repositories/ProductionRepository.ts';
import type { RevenueEntryRepository } from '../../../domain/revenue/repositories/RevenueRepository.ts';
import { notFound } from '../../../shared/errors.ts';

/**
 * Écritures de produits, **et** le revenu en nature qui va avec.
 *
 * Toute la logique du pont avec la comptabilité vit ici, et nulle part ailleurs : les
 * routes ne parlent jamais directement au dépôt de produits, sinon un chemin d'écriture
 * finirait par oublier de synchroniser et le produit reçu ne vaudrait plus rien.
 *
 * La règle tient en une phrase : **un produit `received` valorisé a une entrée de
 * revenu, tous les autres n'en ont pas.** Chaque écriture ramène l'entrée à cet état,
 * quel que soit le chemin emprunté (changement de statut, de montant, de production…).
 */
export class ManageProducts {
  private readonly products: ProductRepository;
  private readonly productions: ProductionRepository;
  private readonly brands: BrandRepository;
  private readonly revenues: RevenueEntryRepository;

  constructor(
    products: ProductRepository,
    productions: ProductionRepository,
    brands: BrandRepository,
    revenues: RevenueEntryRepository,
  ) {
    this.products = products;
    this.productions = productions;
    this.brands = brands;
    this.revenues = revenues;
  }

  create(input: CreateProductInput): Product {
    return this.sync(this.products.create(input));
  }

  update(id: string, input: UpdateProductInput): Product {
    return this.sync(this.products.update(id, input));
  }

  remove(id: string): void {
    const existing = this.products.findById(id);
    if (!existing) throw notFound('Produit');
    // Le revenu part avec le produit : le garder laisserait un montant en nature
    // que plus aucune fiche ne justifie.
    if (existing.revenueEntryId) this.revenues.deleteLinked(existing.revenueEntryId);
    this.products.delete(id);
  }

  /** Re-synchronise tous les produits d'une production (sa chaîne ou sa vidéo a changé). */
  resyncProduction(productionId: string): void {
    for (const product of this.products.findAll({ productionIds: [productionId] })) {
      const fresh = this.products.findById(product.id);
      if (fresh) this.sync(fresh);
    }
  }

  /** Ramène l'entrée de revenu à l'état que décrit le produit. */
  private sync(product: Product): Product {
    const shouldExist = product.status === 'received' && product.valueCents > 0;

    if (!shouldExist) {
      if (!product.revenueEntryId) return product;
      this.revenues.deleteLinked(product.revenueEntryId);
      this.products.setRevenueEntryId(product.id, null);
      return { ...product, revenueEntryId: null };
    }

    // La production porte la chaîne et la vidéo : c'est ce qui fait remonter le produit
    // dans la ligne de la bonne vidéo du tableau de performance, sans saisie de plus.
    const production = product.productionId
      ? this.productions.findById(product.productionId)
      : null;
    const brand = product.brandId ? this.brands.findById(product.brandId) : null;

    const payload = {
      channelId: product.channelId ?? production?.channelId ?? null,
      categoryId: IN_KIND_CATEGORY_ID,
      videoId: production?.videoId ?? null,
      date: product.receivedAt ?? today(),
      amountCents: product.valueCents,
      label: brand ? `${brand.name} — ${product.name}` : product.name,
      notes: production ? `Produit reçu pour « ${production.title} »` : 'Produit reçu',
      origin: 'product' as const,
    };

    if (product.revenueEntryId) {
      this.revenues.updateLinked(product.revenueEntryId, payload);
      return product;
    }

    const entry = this.revenues.create(payload);
    this.products.setRevenueEntryId(product.id, entry.id);
    return { ...product, revenueEntryId: entry.id };
  }
}
