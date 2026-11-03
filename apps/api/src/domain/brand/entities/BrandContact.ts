/**
 * Une personne chez une marque : le carnet de contacts de l'écran Admin → Marques.
 *
 * Il se remplit **tout seul** quand un fil de mails est rattaché à la marque
 * (`source: 'mail'`, interlocuteurs du fil, moi exclu), et se complète à la main
 * (`'manual'`). L'adresse est la clé, en minuscules, une seule fois par marque.
 *
 * **Retirer un contact le masque** (`hiddenAt`), il ne le supprime pas : le fil reste
 * rattaché, et le prochain message qu'il reçoit le ferait revenir. Le resaisir à la main
 * le réaffiche.
 */
export interface BrandContact {
  id: string;
  brandId: string;
  email: string;
  name: string;
  /** Le poste : « chargée de partenariats », « RP »… */
  role: string;
  phone: string;
  notes: string;
  source: BrandContactSource;
  /** Date du dernier message échangé avec lui, `null` pour un contact saisi à la main. */
  lastContactAt: string | null;
  hiddenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BrandContactSource = 'mail' | 'manual';

/** Un contact avec sa marque, pour la recherche dans tout le carnet. */
export interface BrandContactView extends BrandContact {
  brandName: string;
  brandColor: string;
}

export interface BrandContactInput {
  email: string;
  name?: string;
  role?: string;
  phone?: string;
  notes?: string;
}

export type UpdateBrandContactInput = Partial<BrandContactInput>;

/** Ce qu'un message apprend d'un contact : son nom, et quand on s'est écrit. */
export interface SeenContact {
  email: string;
  name: string;
  date: string;
}
