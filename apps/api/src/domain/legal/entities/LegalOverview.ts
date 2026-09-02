import type { Company } from './Company.ts';
import type { LegalObligation } from './LegalObligation.ts';

/**
 * L'état d'une obligation sur un mois donné.
 *
 * Le statut est calculé **côté API** : la règle qui décide qu'une échéance est passée
 * n'existe qu'à un seul endroit, et l'alerte du dashboard comme la pastille du tableau
 * la lisent au lieu de la redéduire chacune de son côté.
 */
export type LegalItemStatus = 'done' | 'late' | 'due_soon' | 'pending';

export interface LegalMonthItem {
  obligationId: string;
  label: string;
  dayOfMonth: number | null;
  /** Échéance réelle, jour limite ramené au dernier jour du mois quand il déborde. */
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

/** Ce qui doit remonter jusqu'au dashboard : en retard, ou à faire dans les jours qui viennent. */
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
  /** Du mois le plus récent au plus ancien : on traite le mois en cours en premier. */
  months: LegalMonth[];
  alerts: LegalAlert[];
  /** Cases cochées sur cases attendues, tous mois confondus. */
  totals: { done: number; expected: number; late: number };
}
