import { Router } from 'express';
import type { Container } from '../../container.ts';
import {
  createTimeEntrySchema,
  startTimerSchema,
  stopTimerSchema,
  timeEntryQuerySchema,
  updateTimeEntrySchema,
} from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Le suivi du temps passé sur les vidéos.
 *
 * `/running` est déclaré avant `/:id`, sinon Express prendrait « running » pour un
 * identifiant — même piège que `/overview` sur les productions.
 */
export const productionTimeRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (req, res) => {
    const query = timeEntryQuerySchema.parse(req.query);
    res.json(
      container.timeEntries.findAll({
        productionIds: query.productionIds,
        from: query.from,
        to: query.to,
      }),
    );
  });

  /** La session en cours, `null` s'il n'y en a pas. */
  router.get('/running', (_req, res) => {
    res.json(container.trackTime.running());
  });

  /** Démarre un chronomètre. Celui qui tournait, s'il y en avait un, est arrêté. */
  router.post('/start', (req, res) => {
    const body = startTimerSchema.parse(req.body);
    res
      .status(201)
      .json(container.trackTime.start(body.productionId, body.stepId ?? null, body.todoId ?? null));
  });

  /**
   * Arrête le chronomètre.
   *
   * Passe par `ManagePlanning` et non par `TrackTime` : si la session avait été lancée
   * depuis un créneau du planning, l'arrêt doit **aussi** recaler ce créneau sur les
   * horaires réellement passés et replanifier ce qui suit. Une session lancée depuis une
   * fiche n'a aucun créneau lié, et rien d'autre ne bouge alors.
   */
  router.post('/:id/stop', async (req, res) => {
    const body = stopTimerSchema.parse(req.body ?? {});
    res.json(await container.managePlanning.stopTimer(param(req, 'id'), body));
  });

  /** Saisie manuelle : un début et une durée, jamais une fin. */
  router.post('/', (req, res) => {
    res.status(201).json(container.trackTime.addManual(createTimeEntrySchema.parse(req.body)));
  });

  router.patch('/:id', (req, res) => {
    res.json(container.trackTime.update(param(req, 'id'), updateTimeEntrySchema.parse(req.body)));
  });

  router.delete('/:id', (req, res) => {
    container.timeEntries.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
