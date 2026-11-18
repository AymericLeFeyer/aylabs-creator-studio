import { Router } from 'express';
import type { Container } from '../../container.ts';
import { createLiveIdeaSchema, updateLiveIdeaSchema } from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Les lives à faire (Production → Live).
 *
 * CRUD nu : une idée de live n'a aucun effet de bord. Le planning les relit lui-même
 * (`ManagePlanning.board`), rien n'est copié ni synchronisé.
 */
export const liveIdeasRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(container.liveIdeas.findAll());
  });

  router.post('/', (req, res) => {
    res.status(201).json(container.liveIdeas.create(createLiveIdeaSchema.parse(req.body)));
  });

  router.patch('/:id', (req, res) => {
    res.json(container.liveIdeas.update(param(req, 'id'), updateLiveIdeaSchema.parse(req.body)));
  });

  router.delete('/:id', (req, res) => {
    container.liveIdeas.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
