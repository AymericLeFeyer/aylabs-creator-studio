import { Router } from 'express';
import type { Container } from '../../container.ts';
import { createIdeaSchema, updateIdeaSchema } from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Le carnet d'idées de la page production.
 *
 * CRUD nu, sans use case : une idée n'a aucun effet de bord. La promotion en vidéo se
 * fait côté front en deux appels (créer la production, puis supprimer l'idée) — un
 * endpoint dédié n'apporterait rien qu'une transaction sur deux écritures indépendantes.
 */
export const ideasRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(container.ideas.findAll());
  });

  router.post('/', (req, res) => {
    res.status(201).json(container.ideas.create(createIdeaSchema.parse(req.body)));
  });

  router.patch('/:id', (req, res) => {
    res.json(container.ideas.update(param(req, 'id'), updateIdeaSchema.parse(req.body)));
  });

  router.delete('/:id', (req, res) => {
    container.ideas.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
