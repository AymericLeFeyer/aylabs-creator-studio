/** Contrat de `/api/categories`. Les catégories sont communes aux revenus et aux dépenses. */

export type CategoryNature = 'cash' | 'in_kind';

/** Côté du grand livre où la catégorie a le droit d'exister. */
export type CategoryScope = 'revenue' | 'expense' | 'both';

export interface Category {
  id: string;
  name: string;
  nature: CategoryNature;
  scope: CategoryScope;
  color: string;
  /** Alimentée par la collecte (AdSense) : la saisie manuelle y est refusée. */
  isAuto: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryInput {
  name: string;
  nature: CategoryNature;
  scope?: CategoryScope;
  color?: string;
  isArchived?: boolean;
}

export const NATURE_LABELS: Record<CategoryNature, string> = {
  cash: 'Encaissé',
  in_kind: 'Produits reçus',
};

export const NATURE_HINTS: Record<CategoryNature, string> = {
  cash: "L'argent arrive sur le compte (AdSense, affiliation, sponsors).",
  in_kind: 'Produits offerts valorisés en €. Comptés dans les gains, jamais en cash.',
};

export const SCOPE_LABELS: Record<CategoryScope, string> = {
  revenue: 'Revenus',
  expense: 'Dépenses',
  both: 'Les deux',
};

export const SCOPE_HINTS: Record<CategoryScope, string> = {
  revenue: "Utilisable seulement à l'entrée (affiliation, sponsors…).",
  expense: 'Utilisable seulement à la sortie (impôts, matériel…).',
  both: 'Disponible des deux côtés, pour ce qui rentre et sort sous le même nom.',
};

/** La nature ne s'applique qu'aux revenus : une dépense sort toujours du compte. */
export const usesNature = (scope: CategoryScope): boolean => scope !== 'expense';

/**
 * Identifiants fixes des catégories seedées au premier démarrage (miroir de
 * `apps/api/src/domain/category/entities/Category.ts`).
 *
 * Ils servent aux règles qui doivent désigner **une** catégorie précise — la part fiscale
 * des dépenses à venir, les revenus d'affiliation qui attendent une plateforme. Se fier
 * au libellé casserait au premier renommage, qui est justement permis.
 */
export const ADSENSE_CATEGORY_ID = 'adsense';
export const AFFILIATE_CATEGORY_ID = 'affiliation';
export const TAX_CATEGORY_ID = 'impots';
