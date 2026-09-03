import { Router } from 'express';
import type { Container } from '../../container.ts';
import { createRecurringExpenseSchema, updateRecurringExpenseSchema } from '../validation.ts';
import { param } from '../helpers.ts';
import { today } from '../../shared/dates.ts';

/**
 * Les dépenses qui reviennent : abonnements, hébergement, assurances.
 *
 * Chaque écriture **reprojette** immédiatement les échéances (`SyncRecurringExpenses`) :
 * créer un abonnement doit faire apparaître ses douze prochaines occurrences tout de
 * suite, sans attendre le prochain démarrage — c'est précisément la visibilité qu'on
 * vient chercher en le saisissant.
 */
export const recurringExpensesRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(container.recurringExpenses.findAll(req.query.includeInactive !== 'false'));
  });

  router.post('/', (req, res) => {
    const { amount, ...rest } = createRecurringExpenseSchema.parse(req.body);
    const rule = container.recurringExpenses.create({ ...rest, amountCents: amount });
    container.syncRecurringExpenses.execute();
    res.status(201).json(rule);
  });

  router.patch('/:id', (req, res) => {
    const { amount, ...rest } = updateRecurringExpenseSchema.parse(req.body);
    const rule = container.recurringExpenses.update(param(req, 'id'), {
      ...rest,
      ...(amount !== undefined ? { amountCents: amount } : {}),
    });

    // Le montant ou le jour a pu changer : les occurrences futures déjà projetées sont
    // réécrites, les passées gardent ce qui a réellement été payé.
    container.syncRecurringExpenses.reproject(rule.id);
    res.json(rule);
  });

  /** Les occurrences futures partent avec la règle, les passées sont détachées. */
  router.delete('/:id', (req, res) => {
    container.recurringExpenses.delete(param(req, 'id'), today());
    res.status(204).end();
  });

  return router;
};
