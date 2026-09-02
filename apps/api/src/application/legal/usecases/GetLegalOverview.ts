import type {
  LegalAlert,
  LegalItemStatus,
  LegalMonth,
  LegalMonthItem,
  LegalOverview,
} from '../../../domain/legal/entities/LegalOverview.ts';
import type {
  CompanyRepository,
  LegalObligationRepository,
} from '../../../domain/legal/repositories/LegalRepository.ts';
import {
  dueDateOf,
  enumerateMonthsDesc,
  monthOf,
  previousMonth,
  type MonthKey,
} from '../../../domain/legal/services/legalCalendar.ts';
import { addDays, today } from '../../../shared/dates.ts';

/** En deçà, une échéance passe en « à faire bientôt » et remonte jusqu'au dashboard. */
const DUE_SOON_DAYS = 7;

/** Sans date de création saisie, le tableau retombe sur les douze derniers mois. */
const FALLBACK_MONTHS = 12;

/** Au-delà, la liste cesse d'être une alerte pour devenir un tableau qu'on ne lit plus. */
const MAX_ALERTS = 8;

/**
 * Le tableau des obligations mensuelles, du mois en cours à la création de la société.
 *
 * Le **statut est calculé ici**, pas dans les écrans : la pastille du tableau légal et
 * l'alerte du dashboard doivent dire la même chose de la même case, et une règle
 * dupliquée finirait par diverger.
 *
 * Toutes les obligations actives s'appliquent à tous les mois de la période : c'est
 * l'archivage qui retire celle qui n'a plus lieu d'être, sans effacer l'historique déjà
 * coché.
 */
export class GetLegalOverview {
  private readonly company: CompanyRepository;
  private readonly obligations: LegalObligationRepository;

  constructor(company: CompanyRepository, obligations: LegalObligationRepository) {
    this.company = company;
    this.obligations = obligations;
  }

  execute(): LegalOverview {
    const company = this.company.get();
    const obligations = this.obligations.findAll();
    const checks = this.obligations.findChecks();

    // Une clé par case cochée : la présence vaut « fait », la valeur porte la date.
    const checkedAt = new Map<string, string>();
    for (const check of checks) {
      checkedAt.set(`${check.obligationId}:${check.month}`, check.checkedAt);
    }

    const now = today();
    const currentMonth = monthOf(now);
    const firstMonth = company.foundedOn
      ? monthOf(company.foundedOn)
      : this.monthsBack(currentMonth, FALLBACK_MONTHS - 1);
    const soonLimit = addDays(now, DUE_SOON_DAYS);

    const months: LegalMonth[] = enumerateMonthsDesc(firstMonth, currentMonth).map((month) => {
      const items: LegalMonthItem[] = obligations.map((obligation) => {
        const dueDate = dueDateOf(month, obligation.dayOfMonth);
        const done = checkedAt.get(`${obligation.id}:${month}`) ?? null;
        return {
          obligationId: obligation.id,
          label: obligation.label,
          dayOfMonth: obligation.dayOfMonth,
          dueDate,
          checked: done !== null,
          checkedAt: done,
          status: statusOf(done !== null, dueDate, now, soonLimit),
        };
      });

      return {
        month,
        items,
        doneCount: items.filter((item) => item.checked).length,
        lateCount: items.filter((item) => item.status === 'late').length,
      };
    });

    const alerts: LegalAlert[] = months
      .flatMap((month) =>
        month.items
          .filter((item) => item.status === 'late' || item.status === 'due_soon')
          .map((item) => ({
            obligationId: item.obligationId,
            month: month.month,
            label: item.label,
            dueDate: item.dueDate,
            severity: item.status === 'late' ? ('danger' as const) : ('warning' as const),
          })),
      )
      // La plus ancienne échéance d'abord : c'est celle qui traîne depuis le plus longtemps.
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, MAX_ALERTS);

    const flat = months.flatMap((month) => month.items);

    return {
      company,
      obligations,
      months,
      alerts,
      totals: {
        done: flat.filter((item) => item.checked).length,
        expected: flat.length,
        late: flat.filter((item) => item.status === 'late').length,
      },
    };
  }

  private monthsBack(month: MonthKey, count: number): MonthKey {
    let cursor = month;
    for (let index = 0; index < count; index += 1) cursor = previousMonth(cursor);
    return cursor;
  }
}

const statusOf = (
  checked: boolean,
  dueDate: string,
  now: string,
  soonLimit: string,
): LegalItemStatus => {
  if (checked) return 'done';
  if (dueDate < now) return 'late';
  return dueDate <= soonLimit ? 'due_soon' : 'pending';
};
