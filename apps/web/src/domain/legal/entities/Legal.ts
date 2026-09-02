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
