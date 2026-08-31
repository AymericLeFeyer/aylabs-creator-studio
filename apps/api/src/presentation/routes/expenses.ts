import { Router } from 'express';
import type { Container } from '../../container.ts';
import { createExpenseSchema, rangeQuerySchema, updateExpenseSchema } from '../validation.ts';
import { param } from '../helpers.ts';

export const expensesRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (req, res) => {
    const query = rangeQuerySchema.parse(req.query);
    res.json(
      container.expenses.findAll({
        range: query.from && query.to ? { from: query.from, to: query.to } : undefined,
        channelIds: query.channelIds,
      }),
    );
  });

  // `amount` (euros) est converti en centimes par le schéma de validation.
  router.post('/', (req, res) => {
    const { amount, ...rest } = createExpenseSchema.parse(req.body);
    res.status(201).json(container.expenses.create({ ...rest, amountCents: amount }));
  });

  router.patch('/:id', (req, res) => {
    const { amount, ...rest } = updateExpenseSchema.parse(req.body);
    res.json(
      container.expenses.update(param(req, 'id'), {
        ...rest,
        ...(amount !== undefined ? { amountCents: amount } : {}),
      }),
    );
  });

  router.delete('/:id', (req, res) => {
    container.expenses.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
