import { Router } from 'express';
import type { Container } from '../../container.ts';
import {
  brandQuerySchema,
  brandStatsQuerySchema,
  createBrandSchema,
  resolveRange,
  updateBrandSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';

export const brandsRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (req, res) => {
    const query = brandQuerySchema.parse(req.query);
    res.json(container.brands.findAll({ includeArchived: query.includeArchived }));
  });

  /**
   * Classements du dashboard. Même période et mêmes chaînes que le reste de l'écran :
   * un classement borné autrement contredirait les cartes juste au-dessus.
   */
  router.get('/stats', (req, res) => {
    const query = brandStatsQuerySchema.parse(req.query);
    res.json(
      container.brands.stats({
        range: resolveRange(query.from, query.to),
        channelIds: query.channelIds,
      }),
    );
  });

  router.post('/', (req, res) => {
    res.status(201).json(container.brands.create(createBrandSchema.parse(req.body)));
  });

  router.patch('/:id', (req, res) => {
    res.json(container.brands.update(param(req, 'id'), updateBrandSchema.parse(req.body)));
  });

  router.delete('/:id', (req, res) => {
    container.brands.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
