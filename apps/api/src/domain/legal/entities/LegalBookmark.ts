/**
 * Un lien utile de l'écran Légal : Urssaf, impôts, portail bancaire, cabinet comptable.
 *
 * Ils vivent **dans la page et non dans les signets du navigateur** parce qu'on les
 * cherche exactement au moment de cocher une case — et parce qu'un signet ne dit pas
 * *à quoi il sert*, là où une description de deux lignes le rappelle un an plus tard.
 *
 * C'est une **ligne** et non une colonne, comme les obligations et les étapes de
 * production : en ajouter un ne demande aucune migration, et le référentiel se gère
 * depuis Paramètres → Société.
 */
export interface LegalBookmark {
  id: string;
  label: string;
  /** Adresse ouverte au clic. Toujours absolue : c'est un site tiers. */
  url: string;
  /** À quoi ça sert. `null` quand le nom suffit. */
  description: string | null;
  /**
   * Vignette. `null` = pas d'image choisie : l'interface tente alors le favicon du site
   * cible, puis retombe sur l'initiale du nom posée sur `color`.
   */
  imageUrl: string | null;
  /** Couleur de repli, attribuée en rotation à la création (comme chaînes et marques). */
  color: string;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLegalBookmarkInput {
  label: string;
  url: string;
  description?: string | null;
  imageUrl?: string | null;
  color?: string;
  sortOrder?: number;
}

export interface UpdateLegalBookmarkInput extends Partial<CreateLegalBookmarkInput> {
  isArchived?: boolean;
}
