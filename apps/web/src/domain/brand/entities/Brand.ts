/** Contrat de `/api/brands`. Duplique celui de l'API : toute évolution va des deux côtés. */

export interface Brand {
  id: string;
  name: string;
  website: string | null;
  contactName: string | null;
  contactEmail: string | null;
  color: string;
  notes: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BrandInput {
  name: string;
  website?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  color?: string;
  notes?: string | null;
  isArchived?: boolean;
}

/** Une ligne de classement du dashboard, bornée par la période affichée. */
export interface BrandStats {
  brandId: string;
  brandName: string;
  color: string;
  productsCount: number;
  productsValueCents: number;
  sponsorshipsPaidCount: number;
  sponsorshipsPaidCents: number;
  /** Argent promis, pas encore encaissé : jamais mélangé au reste. */
  sponsorshipsPendingCents: number;
}
