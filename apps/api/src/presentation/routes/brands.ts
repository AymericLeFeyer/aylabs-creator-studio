import { Router } from 'express';
import type { Container } from '../../container.ts';
import {
  brandContactQuerySchema,
  brandQuerySchema,
  createBrandContactSchema,
  brandStatsQuerySchema,
  createBrandSchema,
  resolveRange,
  updateBrandContactSchema,
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

  /**
   * Le carnet de contacts : d'une marque (`brandId`), ou de toutes pour la recherche.
   * **Déclaré avant `/:id`.** Les contacts nés des mails n'ont pas de route d'écriture à
   * eux : ils arrivent par `ManageBrandContacts`, au rattachement d'un fil.
   */
  router.get('/contacts', (req, res) => {
    res.json(container.brandContacts.findAll(brandContactQuerySchema.parse(req.query)));
  });

  router.patch('/contacts/:contactId', (req, res) => {
    res.json(
      container.brandContacts.update(
        param(req, 'contactId'),
        updateBrandContactSchema.parse(req.body),
      ),
    );
  });

  /** Retire du carnet : masque, pour qu'un relevé ne le fasse pas revenir. */
  router.delete('/contacts/:contactId', (req, res) => {
    container.brandContacts.hide(param(req, 'contactId'));
    res.status(204).end();
  });

  router.post('/:id/contacts', (req, res) => {
    res
      .status(201)
      .json(
        container.brandContacts.create(param(req, 'id'), createBrandContactSchema.parse(req.body)),
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
