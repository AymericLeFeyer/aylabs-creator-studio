import type { Cents } from '../../../shared/money.ts';
import type { IsoDate } from '../../../shared/dates.ts';
import { parseIsoDate, toIsoDate } from '../../../shared/dates.ts';

/** Un abonnement se paie tous les mois, une assurance ou un domaine une fois par an. */
export type RecurrenceFrequency = 'monthly' | 'yearly';

export const RECURRENCE_FREQUENCIES: RecurrenceFrequency[] = ['monthly', 'yearly'];

/**
 * Une dépense qui revient : abonnement logiciel, hébergement, assurance.
 *
 * Ce n'est **pas** une ligne de dépense de plus, c'est une **règle qui en engendre**.
 * Les occurrences sont de vraies `expense_entries` reliées par `recurringId` : elles
 * comptent dans les cumuls, les graphiques et les catégories exactement comme une
 * saisie manuelle, sans qu'aucun calcul n'ait à connaître les récurrences.
 *
 * La projection garde toujours douze occurrences d'avance (`OCCURRENCES_AHEAD`) : c'est
 * ce qui permet de voir arriver une année d'engagements dans les dépenses futures.
 */
export interface RecurringExpense {
  id: string;
  channelId: string | null;
  categoryId: string;
  label: string;
  amountCents: Cents;
  frequency: RecurrenceFrequency;
  /** Jour de prélèvement. Un 31 sur un mois de 30 jours est ramené au dernier jour. */
  dayOfMonth: number;
  /** Mois de prélèvement (1-12). N'a de sens qu'en fréquence annuelle. */
  monthOfYear: number | null;
  startDate: IsoDate;
  /** `null` = sans fin : la règle continue de projeter des occurrences. */
  endDate: IsoDate | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Vue enrichie : la table des abonnements affiche la catégorie et la prochaine échéance. */
export interface RecurringExpenseView extends RecurringExpense {
  categoryName: string;
  categoryColor: string;
  channelName: string | null;
  /** Prochaine occurrence à venir, `null` si la règle est terminée ou inactive. */
  nextDate: IsoDate | null;
  /** Occurrences déjà projetées en base, passées comprises. */
  occurrencesCount: number;
  /** Ce que la règle coûte sur douze mois : le seul chiffre comparable entre fréquences. */
  yearlyCents: Cents;
}

export interface CreateRecurringExpenseInput {
  channelId?: string | null;
  categoryId: string;
  label: string;
  amountCents: Cents;
  frequency: RecurrenceFrequency;
  dayOfMonth?: number;
  monthOfYear?: number | null;
  startDate: IsoDate;
  endDate?: IsoDate | null;
  notes?: string | null;
  isActive?: boolean;
}

export type UpdateRecurringExpenseInput = Partial<CreateRecurringExpenseInput>;

/** Nombre d'échéances maintenues d'avance. Douze = un an de visibilité, quelle que soit la fréquence. */
export const OCCURRENCES_AHEAD = 12;

/** Coût ramené à l'année, pour comparer un abonnement mensuel à une facture annuelle. */
export const yearlyCost = (rule: Pick<RecurringExpense, 'frequency' | 'amountCents'>): Cents =>
  rule.frequency === 'monthly' ? rule.amountCents * 12 : rule.amountCents;

/**
 * Date d'échéance dans un mois donné, jour de prélèvement ramené au dernier jour du
 * mois quand il n'existe pas (un 31 en février).
 */
export const dueDateIn = (year: number, month: number, dayOfMonth: number): IsoDate => {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(Math.max(dayOfMonth, 1), lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/**
 * Les prochaines échéances d'une règle, à partir de `from` inclus.
 *
 * Le calcul vit dans le domaine et non dans le dépôt : c'est la même fonction qui
 * projette les occurrences en base et qui répond « prochaine échéance le… » dans la
 * table des abonnements — deux calculs parallèles finiraient par se contredire.
 */
export const nextOccurrences = (
  rule: Pick<
    RecurringExpense,
    'frequency' | 'dayOfMonth' | 'monthOfYear' | 'startDate' | 'endDate' | 'isActive'
  >,
  from: IsoDate,
  count: number,
): IsoDate[] => {
  if (!rule.isActive || count <= 0) return [];

  // On ne projette jamais avant le début de la règle : un abonnement souscrit en mars
  // n'a pas d'échéance en février.
  const floor = from > rule.startDate ? from : rule.startDate;
  const cursor = parseIsoDate(floor);
  const dates: IsoDate[] = [];

  if (rule.frequency === 'yearly') {
    const month = rule.monthOfYear ?? parseIsoDate(rule.startDate).getUTCMonth() + 1;
    let year = cursor.getUTCFullYear();
    for (let guard = 0; dates.length < count && guard < count + 2; guard += 1) {
      const date = dueDateIn(year, month, rule.dayOfMonth);
      year += 1;
      if (date < floor) continue;
      if (rule.endDate && date > rule.endDate) break;
      dates.push(date);
    }
    return dates;
  }

  let year = cursor.getUTCFullYear();
  let month = cursor.getUTCMonth() + 1;
  for (let guard = 0; dates.length < count && guard < count + 2; guard += 1) {
    const date = dueDateIn(year, month, rule.dayOfMonth);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (date < floor) continue;
    if (rule.endDate && date > rule.endDate) break;
    dates.push(date);
  }
  return dates;
};

/** Premier jour du mois d'une date, pour repartir du début du mois courant. */
export const startOfMonthIso = (date: IsoDate): IsoDate => {
  const d = parseIsoDate(date);
  d.setUTCDate(1);
  return toIsoDate(d);
};
