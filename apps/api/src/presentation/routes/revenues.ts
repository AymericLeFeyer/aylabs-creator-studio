import { Router } from 'express';
import type { Container } from '../../container.ts';
import {
  categoryQuerySchema,
  createCategorySchema,
  createRevenueSchema,
  rangeQuerySchema,
  updateCategorySchema,
  updateRevenueSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';

export const categoriesRouter = (container: Container): Router => {
  const router = Router();

  // `scope` restreint la liste à un côté du grand livre ; les catégories `both` répondent
  // toujours, c'est ce qui permet aux formulaires de revenu et de dépense de se servir
  // dans le même référentiel sans proposer « Impôts » en revenu.
  router.get('/', (req, res) => {
    const { includeArchived, scope } = categoryQuerySchema.parse(req.query);
    res.json(container.categories.findAll({ includeArchived, scope }));
  });

  router.post('/', (req, res) => {
    res.status(201).json(container.categories.create(createCategorySchema.parse(req.body)));
  });

  router.patch('/:id', (req, res) => {
    res.json(container.categories.update(param(req, 'id'), updateCategorySchema.parse(req.body)));
  });

  router.delete('/:id', (req, res) => {
    container.categories.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};

export const revenuesRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (req, res) => {
    const query = rangeQuerySchema.parse(req.query);
    res.json(
      container.revenues.findAll({
        range: query.from && query.to ? { from: query.from, to: query.to } : undefined,
        channelIds: query.channelIds,
      }),
    );
  });

  // `amount` (euros) est converti en centimes par le schéma de validation.
  router.post('/', (req, res) => {
    const { amount, ...rest } = createRevenueSchema.parse(req.body);
    res.status(201).json(container.revenues.create({ ...rest, amountCents: amount }));
  });

  router.patch('/:id', (req, res) => {
    const { amount, ...rest } = updateRevenueSchema.parse(req.body);
    res.json(
      container.revenues.update(param(req, 'id'), {
        ...rest,
        ...(amount !== undefined ? { amountCents: amount } : {}),
      }),
    );
  });

  router.delete('/:id', (req, res) => {
    container.revenues.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
