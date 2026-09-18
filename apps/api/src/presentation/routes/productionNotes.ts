import { Router } from 'express';
import type { Container } from '../../container.ts';
import { createProductionNoteSchema, updateProductionNoteSchema } from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Les notes **d'une vidéo**, rangées comme des petits fichiers.
 *
 * CRUD nu, sans use case : une note n'a aucun effet de bord — ni sur l'avancement, ni
 * sur l'argent, ni sur le planning. Monté sous `/api/productions/:id/notes`, **avant**
 * `/api/productions` (voir `server.ts`).
 */
export const productionNotesRouter = (container: Container): Router => {
  const router = Router({ mergeParams: true });

  router.get('/', (req, res) => {
    res.json(container.productionNotes.findByProduction(param(req, 'id')));
  });

  router.post('/', (req, res) => {
    res
      .status(201)
      .json(
        container.productionNotes.create(
          param(req, 'id'),
          createProductionNoteSchema.parse(req.body),
        ),
      );
  });

  router.patch('/:noteId', (req, res) => {
    res.json(
      container.productionNotes.update(
        param(req, 'id'),
        param(req, 'noteId'),
        updateProductionNoteSchema.parse(req.body),
      ),
    );
  });

  router.delete('/:noteId', (req, res) => {
    container.productionNotes.delete(param(req, 'id'), param(req, 'noteId'));
    res.status(204).end();
  });

  return router;
};
