import type { Cents } from '../../../shared/money.ts';
import type { IsoDate } from '../../../shared/dates.ts';
import { parseIsoDate, toIsoDate } from '../../../shared/dates.ts';

/**
 * Une dépense qui revient : abonnement logiciel, hébergement, assurance.
 *
 * Ce n'est **pas** une ligne de dépense de plus, c'est une **règle qui en engendre**.
 * Les occurrences sont de vraies `expense_entries` reliées par `recurringId` : elles
 * comptent dans les cumuls, les graphiques et les catégories exactement comme une
 * saisie manuelle, sans qu'aucun calcul n'ait à connaître les récurrences.
 */
export interface RecurringExpense {
  id: string;
  channelId: string | null;
  categoryId: string;
  label: string;
  amountCents: Cents;
  /**
   * Périodicité, **en mois**. 1 = mensuel, 3 = trimestriel, 12 = annuel, 24 = tous les
   * deux ans.
   *
   * Un nombre plutôt qu'une énumération : ajouter « tous les deux ans » à une liste
   * fermée demandait une migration, et la suivante en aurait demandé une autre. Ici,
   * toute périodicité exprimable en mois existe déjà.
   */
  intervalMonths: number;
  /** Jour de prélèvement. Un 31 sur un mois de 30 jours est ramené au dernier jour. */
  dayOfMonth: number;
  /**
   * Première échéance : c'est elle qui **ancre** le rythme. Une règle tous les 24 mois
   * démarrée en mars 2026 tombe en mars 2028.
   */
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
  /** Ce que la règle coûte sur douze mois : le seul chiffre comparable entre rythmes. */
  yearlyCents: Cents;
}

export interface CreateRecurringExpenseInput {
  channelId?: string | null;
  categoryId: string;
  label: string;
  amountCents: Cents;
  intervalMonths: number;
  dayOfMonth?: number;
  startDate: IsoDate;
  endDate?: IsoDate | null;
  notes?: string | null;
  isActive?: boolean;
}

export type UpdateRecurringExpenseInput = Partial<CreateRecurringExpenseInput>;

/**
 * Horizon de projection, en mois.
 *
 * On ne compte plus un nombre fixe d'occurrences mais une **durée** : douze occurrences
 * d'un abonnement mensuel font un an de visibilité, alors que douze occurrences d'un
 * abonnement annuel projetaient douze ans d'échéances imaginaires dans la comptabilité.
 */
export const OCCURRENCES_HORIZON_MONTHS = 12;

/** Garde-fou : on projette au moins la prochaine échéance, jamais plus de douze. */
const MIN_OCCURRENCES = 1;
const MAX_OCCURRENCES = 12;

/** Combien d'échéances projeter pour couvrir l'horizon, selon le rythme de la règle. */
export const occurrencesToProject = (intervalMonths: number): number => {
  const needed = Math.ceil(OCCURRENCES_HORIZON_MONTHS / Math.max(1, intervalMonths));
  return Math.min(MAX_OCCURRENCES, Math.max(MIN_OCCURRENCES, needed));
};

/** Coût ramené à l'année, pour comparer un abonnement mensuel à une facture bisannuelle. */
export const yearlyCost = (rule: Pick<RecurringExpense, 'intervalMonths' | 'amountCents'>): Cents =>
  Math.round((rule.amountCents * 12) / Math.max(1, rule.intervalMonths));

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
 * Le rythme est **ancré sur `startDate`** : on avance de `intervalMonths` en
 * `intervalMonths` depuis le mois de départ, et on ne retient que ce qui tombe dans la
 * fenêtre. C'est ce qui fait qu'une règle bisannuelle démarrée en mars 2026 tombe en
 * mars 2028 et non en mars 2027.
 *
 * Le calcul vit dans le domaine et non dans le dépôt : c'est la même fonction qui
 * projette les occurrences en base et qui répond « prochaine échéance le… » dans la
 * table des abonnements — deux calculs parallèles finiraient par se contredire.
 */
export const nextOccurrences = (
  rule: Pick<
    RecurringExpense,
    'intervalMonths' | 'dayOfMonth' | 'startDate' | 'endDate' | 'isActive'
  >,
  from: IsoDate,
  count: number,
): IsoDate[] => {
  if (!rule.isActive || count <= 0) return [];

  const interval = Math.max(1, rule.intervalMonths);
  // On ne projette jamais avant le début de la règle : un abonnement souscrit en mars
  // n'a pas d'échéance en février.
  const floor = from > rule.startDate ? from : rule.startDate;

  const start = parseIsoDate(rule.startDate);
  const startMonths = start.getUTCFullYear() * 12 + start.getUTCMonth();
  const bound = parseIsoDate(floor);
  const floorMonths = bound.getUTCFullYear() * 12 + bound.getUTCMonth();

  // Premier multiple du rythme qui atteint la borne basse : on ne déroule pas les
  // échéances passées une par une pour arriver à aujourd'hui.
  let step = Math.max(0, Math.ceil((floorMonths - startMonths) / interval));

  const dates: IsoDate[] = [];
  for (let guard = 0; dates.length < count && guard < count + 2; guard += 1) {
    const months = startMonths + step * interval;
    const date = dueDateIn(Math.floor(months / 12), (months % 12) + 1, rule.dayOfMonth);
    step += 1;

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
