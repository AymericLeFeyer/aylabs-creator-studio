import { Router } from 'express';
import type { Container } from '../../container.ts';
import { createPostDraftSchema, updatePostDraftSchema } from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Les brouillons de publication de Production → Publications.
 *
 * CRUD nu, sans use case, comme le carnet d'idées : un brouillon n'a aucun effet de bord.
 */
export const postDraftsRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(container.postDrafts.findAll());
  });

  router.post('/', (req, res) => {
    res.status(201).json(container.postDrafts.create(createPostDraftSchema.parse(req.body)));
  });

  router.patch('/:id', (req, res) => {
    res.json(container.postDrafts.update(param(req, 'id'), updatePostDraftSchema.parse(req.body)));
  });

  router.delete('/:id', (req, res) => {
    container.postDrafts.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
