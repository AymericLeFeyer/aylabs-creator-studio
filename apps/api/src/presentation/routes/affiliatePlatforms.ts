import { Router } from 'express';
import type { Container } from '../../container.ts';
import {
  createAffiliatePlatformSchema,
  platformQuerySchema,
  updateAffiliatePlatformSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Les plateformes d'affiliation.
 *
 * La liste porte déjà les gains : « laquelle me rapporte le plus » est la question qu'on
 * pose en ouvrant l'écran, et un second appel pour l'obtenir ferait afficher le tableau
 * puis les montants — donc sauter les lignes sous les yeux.
 */
export const affiliatePlatformsRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (req, res) => {
    const query = platformQuerySchema.parse(req.query);
    res.json(
      container.affiliatePlatforms.findAll({
        includeArchived: query.includeArchived,
        range: query.from && query.to ? { from: query.from, to: query.to } : undefined,
      }),
    );
  });

  router.post('/', (req, res) => {
    res
      .status(201)
      .json(container.affiliatePlatforms.create(createAffiliatePlatformSchema.parse(req.body)));
  });

  router.patch('/:id', (req, res) => {
    res.json(
      container.affiliatePlatforms.update(
        param(req, 'id'),
        updateAffiliatePlatformSchema.parse(req.body),
      ),
    );
  });

  /** Les revenus rattachés sont détachés, jamais supprimés. */
  router.delete('/:id', (req, res) => {
    container.affiliatePlatforms.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
