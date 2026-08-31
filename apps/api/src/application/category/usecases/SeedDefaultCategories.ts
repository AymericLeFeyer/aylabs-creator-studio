import type { DatabaseSync } from 'node:sqlite';
import {
  ADSENSE_CATEGORY_ID,
  TAX_CATEGORY_ID,
} from '../../../domain/category/entities/Category.ts';
import type { CategoryNature, CategoryScope } from '../../../domain/category/entities/Category.ts';

interface SeedCategory {
  id: string;
  name: string;
  nature: CategoryNature;
  scope: CategoryScope;
  color: string;
  isAuto: boolean;
  sortOrder: number;
}

/**
 * Les catégories de départ, revenus et dépenses confondus. Elles sont créées une seule
 * fois, à identifiant fixe, pour rester reconnaissables entre deux redéploiements ;
 * l'utilisateur reste libre de les renommer, les archiver ou en ajouter.
 */
const DEFAULTS: SeedCategory[] = [
  {
    id: ADSENSE_CATEGORY_ID,
    name: 'AdSense',
    nature: 'cash',
    scope: 'revenue',
    color: '#ef4444',
    // Alimentée par YouTube Analytics : la saisie manuelle y est bloquée.
    isAuto: true,
    sortOrder: 1,
  },
  {
    id: 'affiliation',
    name: 'Affiliation',
    nature: 'cash',
    scope: 'revenue',
    color: '#3b82f6',
    isAuto: false,
    sortOrder: 2,
  },
  {
    id: 'sponsors',
    name: 'Sponsors',
    nature: 'cash',
    scope: 'revenue',
    color: '#22c55e',
    isAuto: false,
    sortOrder: 3,
  },
  {
    // Produits reçus des marques : compte dans ce qui est gagné, mais jamais en cash.
    id: 'produits',
    name: 'Produits',
    nature: 'in_kind',
    scope: 'revenue',
    color: '#a855f7',
    isAuto: false,
    sortOrder: 4,
  },
  {
    // Reprend les anciennes taxes (migration 2) : impôts, URSSAF, TVA.
    id: TAX_CATEGORY_ID,
    name: 'Impôts',
    nature: 'cash',
    scope: 'expense',
    color: '#f97316',
    isAuto: false,
    sortOrder: 10,
  },
  {
    id: 'materiel',
    name: 'Matériel',
    nature: 'cash',
    scope: 'expense',
    color: '#0ea5e9',
    isAuto: false,
    sortOrder: 11,
  },
  {
    id: 'abonnements',
    name: 'Abonnements',
    nature: 'cash',
    scope: 'expense',
    color: '#8b5cf6',
    isAuto: false,
    sortOrder: 12,
  },
];

export const seedDefaultCategories = (db: DatabaseSync): void => {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO categories
       (id, name, nature, scope, color, is_auto, is_archived, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  );

  for (const category of DEFAULTS) {
    stmt.run(
      category.id,
      category.name,
      category.nature,
      category.scope,
      category.color,
      category.isAuto ? 1 : 0,
      category.sortOrder,
      now,
      now,
    );
  }
};
