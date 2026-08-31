/**
 * Nature d'une catégorie de revenu :
 * - `cash`    : l'argent arrive réellement sur le compte (AdSense, affiliation, sponsos).
 * - `in_kind` : avantage en nature (produits offerts valorisés en €). Ça compte dans
 *   ce que tu as « gagné », mais ça n'est jamais du cash, donc jamais taxable ici
 *   et toujours isolable d'un clic sur le graphique.
 *
 * La nature ne concerne que les revenus : une dépense sort toujours du compte.
 */
export type CategoryNature = 'cash' | 'in_kind';

/**
 * Côté du grand livre où la catégorie a le droit d'exister. Une même catégorie peut
 * servir des deux côtés (`both`, par exemple « Matériel » revendu puis racheté), mais
 * « Affiliation » n'a de sens qu'en revenu et « Impôts » qu'en dépense.
 */
export type CategoryScope = 'revenue' | 'expense' | 'both';

export const CATEGORY_SCOPES: CategoryScope[] = ['revenue', 'expense', 'both'];

export interface Category {
  id: string;
  name: string;
  nature: CategoryNature;
  scope: CategoryScope;
  color: string;
  /**
   * Catégorie alimentée automatiquement par la collecte (AdSense via YouTube Analytics).
   * Les entrées manuelles y sont refusées : la source de vérité reste `daily_metrics`,
   * sinon le même euro serait compté deux fois.
   */
  isAuto: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryInput {
  name: string;
  nature: CategoryNature;
  scope?: CategoryScope;
  color?: string;
  sortOrder?: number;
}

export type UpdateCategoryInput = Partial<CreateCategoryInput> & {
  isArchived?: boolean;
};

/** `true` si la catégorie accepte un revenu. */
export const acceptsRevenue = (scope: CategoryScope): boolean => scope !== 'expense';

/** `true` si la catégorie accepte une dépense. */
export const acceptsExpense = (scope: CategoryScope): boolean => scope !== 'revenue';

/** Identifiant fixe de la catégorie AdSense, créée au premier démarrage. */
export const ADSENSE_CATEGORY_ID = 'adsense';

/** Identifiant fixe de la catégorie qui a repris les anciennes taxes (migration 2). */
export const TAX_CATEGORY_ID = 'impots';
