import { Router } from 'express';
import type { Container } from '../../container.ts';
import { createExternalAppSchema, updateExternalAppSchema } from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Les applications externes ouvertes en iframe depuis le menu.
 *
 * Chaque réponse porte `frameUrl`, l'adresse réellement ouverte : pour l'app Todo, celle
 * de sa connexion quand elle n'en a pas de propre.
 */
export const externalAppsRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(container.manageExternalApps.list());
  });

  router.post('/', (req, res) => {
    res
      .status(201)
      .json(container.manageExternalApps.create(createExternalAppSchema.parse(req.body)));
  });

  router.patch('/:id', (req, res) => {
    res.json(
      container.manageExternalApps.update(
        param(req, 'id'),
        updateExternalAppSchema.parse(req.body),
      ),
    );
  });

  router.delete('/:id', (req, res) => {
    container.manageExternalApps.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
