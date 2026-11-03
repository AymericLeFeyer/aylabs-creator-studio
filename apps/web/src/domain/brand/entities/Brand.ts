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

/**
 * Une personne chez une marque : le carnet de contacts (Admin → Marques). Contrat de
 * `/api/brands/contacts`. Rempli tout seul par les fils de mails rattachés à la marque
 * (`source: 'mail'`), complété à la main (`'manual'`).
 */
export interface BrandContact {
  id: string;
  brandId: string;
  brandName: string;
  brandColor: string;
  email: string;
  name: string;
  role: string;
  phone: string;
  notes: string;
  source: 'mail' | 'manual';
  /** Dernier message échangé, `null` pour un contact saisi à la main. */
  lastContactAt: string | null;
  hiddenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrandContactInput {
  email: string;
  name?: string;
  role?: string;
  phone?: string;
  notes?: string;
}

/** « Prénom Nom », sinon l'adresse. */
export const contactLabel = (contact: Pick<BrandContact, 'name' | 'email'>): string =>
  contact.name.trim() || contact.email;
