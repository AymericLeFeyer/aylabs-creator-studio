import type { Product } from '../entities/Product.ts';
import { PRODUCT_SORT_RANK } from '../entities/Product.ts';
import { productIsOutstanding } from '../../partner/services/pipeline.ts';

/** Colonnes triables de la table des produits. `null` = l'ordre par défaut. */
export type ProductSortKey =
  'name' | 'brand' | 'status' | 'deadline' | 'receivedAt' | 'video' | 'value';

export interface ProductSort {
  key: ProductSortKey | null;
  desc: boolean;
}

export const DEFAULT_PRODUCT_SORT: ProductSort = { key: null, desc: false };

const videoLabel = (product: Product): string | null =>
  product.productionTitle ?? product.videoTitle;

/** Valeur comparée par colonne. `null` = rien à comparer, toujours en fin de liste. */
const valueOf = (product: Product, key: ProductSortKey): string | number | null => {
  switch (key) {
    case 'name':
      return product.name;
    case 'brand':
      return product.brandName;
    case 'status':
      return PRODUCT_SORT_RANK[product.status];
    case 'deadline':
      return product.deadline;
    case 'receivedAt':
      return product.receivedAt;
    case 'video':
      return videoLabel(product);
    case 'value':
      return product.valueCents;
  }
};

const compareValues = (a: string | number, b: string | number): number =>
  typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' });

/** Échéance croissante, les lignes sans échéance à la fin. */
const byDeadline = (a: Product, b: Product): number => {
  if (a.deadline === b.deadline) return 0;
  if (a.deadline === null) return 1;
  if (b.deadline === null) return -1;
  return a.deadline < b.deadline ? -1 : 1;
};

/**
 * Trie la table des produits.
 *
 * **Par défaut, les produits reçus sans vidéo passent en tête, par échéance** : c'est la
 * pile à tourner (`productIsOutstanding`), et l'échéance dit laquelle attaquer d'abord.
 * Le reste garde l'ordre de l'API (`PRODUCT_SORT_RANK`, puis dates) — le tri est stable.
 *
 * Sur une colonne, les valeurs absentes ferment la liste **quel que soit le sens** : un
 * produit sans échéance n'est ni le plus urgent ni le moins urgent.
 */
export const sortProducts = (products: Product[], sort: ProductSort): Product[] => {
  const { key } = sort;
  if (key === null) {
    return [...products].sort((a, b) => {
      const outstandingA = productIsOutstanding(a);
      const outstandingB = productIsOutstanding(b);
      if (outstandingA !== outstandingB) return outstandingA ? -1 : 1;
      return outstandingA ? byDeadline(a, b) : 0;
    });
  }
  return [...products].sort((a, b) => {
    const valueA = valueOf(a, key);
    const valueB = valueOf(b, key);
    if (valueA === null || valueB === null) {
      return valueA === valueB ? 0 : valueA === null ? 1 : -1;
    }
    const result = compareValues(valueA, valueB);
    return sort.desc ? -result : result;
  });
};

/**
 * Clic sur un en-tête : croissant, puis décroissant, puis retour à l'ordre par défaut —
 * sans ce troisième temps, l'ordre « à tourner d'abord » ne se retrouverait qu'en
 * rechargeant la page.
 */
export const nextProductSort = (current: ProductSort, key: ProductSortKey): ProductSort => {
  if (current.key !== key) return { key, desc: false };
  if (!current.desc) return { key, desc: true };
  return DEFAULT_PRODUCT_SORT;
};
