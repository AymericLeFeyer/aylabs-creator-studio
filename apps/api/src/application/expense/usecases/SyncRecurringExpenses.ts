import type { ExpenseRepository } from '../../../domain/expense/repositories/ExpenseRepository.ts';
import type { RecurringExpenseRepository } from '../../../domain/expense/repositories/RecurringExpenseRepository.ts';
import {
  OCCURRENCES_AHEAD,
  nextOccurrences,
  startOfMonthIso,
} from '../../../domain/expense/entities/RecurringExpense.ts';
import { today } from '../../../shared/dates.ts';

/**
 * Projette les échéances à venir de chaque dépense récurrente.
 *
 * Le principe : **une règle a toujours douze échéances d'avance**. On ne cherche pas à
 * savoir lesquelles manquent — on redemande les douze prochaines et on les insère en
 * `INSERT OR IGNORE` sur l'index unique `(recurring_id, date)`. La projection est donc
 * idempotente : la rejouer dix fois par jour ne crée jamais de doublon, et une règle
 * dont le montant ou le jour a changé se rattrape toute seule au passage suivant.
 *
 * Elle repart du **début du mois courant** et non d'aujourd'hui : l'échéance du 5 alors
 * qu'on est le 12 fait partie du mois en cours, et l'oublier laisserait un trou dans la
 * comptabilité du mois qu'on est justement en train de lire.
 *
 * Conséquence assumée : supprimer à la main une occurrence **future** la fait revenir au
 * prochain passage. Pour retirer une échéance pour de bon, c'est la règle qu'on arrête
 * (`isActive: false`) ou qu'on borne (`endDate`).
 *
 * Elle tourne au démarrage, à chaque écriture d'une règle, et à chaque collecte
 * planifiée — trois occasions plutôt qu'un cron dédié : la projection ne coûte que
 * quelques insertions ignorées.
 */
export class SyncRecurringExpenses {
  private readonly rules: RecurringExpenseRepository;
  private readonly expenses: ExpenseRepository;

  constructor(rules: RecurringExpenseRepository, expenses: ExpenseRepository) {
    this.rules = rules;
    this.expenses = expenses;
  }

  /** Renvoie le nombre d'occurrences réellement créées. */
  execute(now = today()): number {
    const from = startOfMonthIso(now);
    let created = 0;

    for (const rule of this.rules.findAll()) {
      if (!rule.isActive) continue;

      for (const date of nextOccurrences(rule, from, OCCURRENCES_AHEAD)) {
        try {
          this.expenses.create({
            channelId: rule.channelId,
            categoryId: rule.categoryId,
            date,
            amountCents: rule.amountCents,
            label: rule.label,
            notes: rule.notes,
            recurringId: rule.id,
          });
          created += 1;
        } catch (error) {
          // L'index unique (recurring_id, date) rejette l'occurrence déjà projetée :
          // c'est le cas normal, et c'est précisément ce qui rend l'opération idempotente.
          if (!isDuplicate(error)) throw error;
        }
      }
    }

    return created;
  }

  /**
   * Réécrit les échéances **à venir** d'une règle qui vient d'être modifiée.
   *
   * Le mois courant est inclus : une échéance du 5 qu'on corrige le 12 doit prendre le
   * nouveau montant, sinon la correction ne se verrait qu'au mois suivant. Les mois
   * antérieurs, eux, ne bougent pas — ce qui a été payé a été payé.
   */
  reproject(ruleId: string, now = today()): number {
    this.rules.deleteOccurrencesFrom(ruleId, startOfMonthIso(now));
    return this.execute(now);
  }
}

/** Une violation d'unicité SQLite : l'occurrence existe déjà, il n'y a rien à faire. */
const isDuplicate = (error: unknown): boolean =>
  error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
