import type { Cents } from '../../../shared/money.ts';

/**
 * Une marque avec qui tu travailles : celle qui envoie des produits, celle qui paie
 * une sponso, souvent les deux.
 *
 * C'est un **référentiel**, pas un champ texte : sans identifiant partagé entre les
 * produits et les sponsos, « la marque qui me donne le plus » ne serait pas calculable
 * — trois orthographes du même nom feraient trois lignes de classement.
 */
export interface Brand {
  id: string;
  name: string;
  website: string | null;
  contactName: string | null;
  contactEmail: string | null;
  /** Couleur de la pastille dans les listes et les classements du dashboard. */
  color: string;
  notes: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBrandInput {
  name: string;
  website?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  color?: string;
  notes?: string | null;
}

export type UpdateBrandInput = Partial<CreateBrandInput> & { isArchived?: boolean };

/**
 * Ligne de classement du dashboard, bornée par la période affichée.
 *
 * Les produits sont comptés à leur date de **réception** et les sponsos à leur date de
 * **paiement** : ce sont les seuls moments où quelque chose a réellement été reçu.
 * `sponsorshipsPendingCents` échappe à cette règle — c'est de l'argent promis, pas
 * encore encaissé, donc compté sur la deadline et affiché à part.
 */
export interface BrandStats {
  brandId: string;
  brandName: string;
  color: string;
  /** Produits reçus sur la période. */
  productsCount: number;
  productsValueCents: Cents;
  /** Sponsos encaissées sur la période. */
  sponsorshipsPaidCount: number;
  sponsorshipsPaidCents: Cents;
  /** Sponsos signées ou en cours, pas encore payées. Jamais mélangé au reste. */
  sponsorshipsPendingCents: Cents;
}
