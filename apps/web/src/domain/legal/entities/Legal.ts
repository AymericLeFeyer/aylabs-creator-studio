/**
 * Contrat de `/api/legal`.
 *
 * Comme le reste du contrat, les types sont redéclarés côté front plutôt que partagés
 * dans un package. Toute évolution doit être répercutée des deux côtés.
 */

export interface Company {
  id: string;
  name: string;
  legalForm: string | null;
  siret: string | null;
  vatNumber: string | null;
  address: string | null;
  /** Date de création : c'est elle qui décide du premier mois du tableau. */
  foundedOn: string | null;
  notes: string | null;
  updatedAt: string;
}

export type CompanyInput = Partial<Omit<Company, 'id' | 'updatedAt'>>;

export interface LegalObligation {
  id: string;
  label: string;
  /** Jour limite dans le mois. `null` = pas d'échéance, le mois entier fait foi. */
  dayOfMonth: number | null;
  notes: string | null;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LegalObligationInput {
  label: string;
  dayOfMonth?: number | null;
  notes?: string | null;
  sortOrder?: number;
  isArchived?: boolean;
}

export type LegalItemStatus = 'done' | 'late' | 'due_soon' | 'pending';

export interface LegalMonthItem {
  obligationId: string;
  label: string;
  dayOfMonth: number | null;
  dueDate: string;
  checked: boolean;
  checkedAt: string | null;
  status: LegalItemStatus;
}

export interface LegalMonth {
  /** `AAAA-MM`. */
  month: string;
  items: LegalMonthItem[];
  doneCount: number;
  lateCount: number;
}

export interface LegalAlert {
  obligationId: string;
  month: string;
  label: string;
  dueDate: string;
  severity: 'danger' | 'warning';
}

export interface LegalOverview {
  company: Company;
  obligations: LegalObligation[];
  /** Du mois le plus récent au plus ancien. */
  months: LegalMonth[];
  alerts: LegalAlert[];
  totals: { done: number; expected: number; late: number };
}

/**
 * Le statut vient de l'API et n'est jamais recalculé ici : la pastille du tableau et
 * l'alerte du dashboard doivent dire la même chose de la même case.
 */
export const STATUS_COLORS: Record<LegalItemStatus, string> = {
  done: 'var(--positive)',
  late: 'var(--negative)',
  due_soon: 'var(--expense)',
  pending: 'var(--muted-foreground)',
};

export const STATUS_LABELS: Record<LegalItemStatus, string> = {
  done: 'Fait',
  late: 'En retard',
  due_soon: 'À faire bientôt',
  pending: 'À faire',
};

/** « 2026-09 » → « septembre 2026 ». Le mois est la maille du tableau, pas une date. */
export const formatMonth = (month: string): string => {
  const [year, monthNumber] = month.split('-');
  const label = new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1)).toLocaleDateString(
    'fr-FR',
    { month: 'long', year: 'numeric', timeZone: 'UTC' },
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/** L'échéance telle qu'on la dit : « Max le 15 », ou rien quand le mois entier fait foi. */
export const dueLabel = (dayOfMonth: number | null): string | null =>
  dayOfMonth === null ? null : `Max le ${dayOfMonth}`;

/**
 * Un lien utile de l'écran Légal : Urssaf, impôts, portail bancaire, comptable.
 *
 * Ils vivent dans la page et non dans les signets du navigateur : on les cherche
 * exactement au moment de cocher une case, et un signet ne dit pas *à quoi il sert* —
 * là où une description de deux lignes le rappelle un an plus tard.
 */
export interface LegalBookmark {
  id: string;
  label: string;
  url: string;
  description: string | null;
  /** `null` = pas d'image choisie : on tente le favicon du site, puis l'initiale. */
  imageUrl: string | null;
  color: string;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LegalBookmarkInput {
  label: string;
  url: string;
  description?: string | null;
  imageUrl?: string | null;
  color?: string;
  sortOrder?: number;
  isArchived?: boolean;
}

/**
 * Le favicon du site cible, deviné depuis l'URL.
 *
 * Sert de **repli** quand aucune image n'a été saisie. Il est demandé au site lui-même
 * (`https://host/favicon.ico`) et non à un service de vignettes tiers : ce serait
 * envoyer à un inconnu la liste des sites administratifs qu'on consulte, pour une image
 * de seize pixels. Beaucoup de sites répondent ; ceux qui ne répondent pas retombent sur
 * l'initiale, et personne n'a rien appris au passage.
 *
 * `null` si l'URL est inexploitable — on ne veut pas d'une `<img>` sur une adresse vide.
 */
export const faviconOf = (url: string): string | null => {
  try {
    return new URL(url).origin + '/favicon.ico';
  } catch {
    return null;
  }
};

/** « urssaf.fr » — le domaine seul, pour montrer où mène le lien sans l'URL entière. */
export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};
