import type {
  BrandContactInput,
  BrandContactView,
  SeenContact,
  UpdateBrandContactInput,
} from '../entities/BrandContact.ts';

export interface BrandContactFilter {
  brandId?: string;
  /** Nom, adresse, poste ou marque. */
  search?: string;
}

export interface BrandContactRepository {
  /** Les contacts visibles, les plus récemment joints d'abord. */
  findAll(filter?: BrandContactFilter): BrandContactView[];
  findById(id: string): BrandContactView | null;
  /** Saisie à la main : réaffiche un contact masqué de même adresse. */
  create(brandId: string, input: BrandContactInput): BrandContactView;
  update(id: string, input: UpdateBrandContactInput): BrandContactView;
  /** Masque, ne supprime pas : voir `BrandContact.hiddenAt`. */
  hide(id: string): void;
  /**
   * Enregistre ce que des mails ont appris : crée les inconnus, complète un nom vide et
   * avance `lastContactAt`. **Ne réaffiche jamais un contact masqué.**
   */
  recordSeen(brandId: string, contacts: SeenContact[]): void;
}
