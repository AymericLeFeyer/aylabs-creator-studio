import { Router } from 'express';
import type { Container } from '../../container.ts';
import {
  createGoalSchema,
  goalPreviewQuerySchema,
  reorderSchema,
  todayQuerySchema,
  updateGoalSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Les objectifs de l'écran Succès. `?today=` porte le jour **local** du navigateur : le
 * serveur est en UTC, et c'est lui qui décide si une échéance est passée.
 */
export const goalsRouter = (container: Container): Router => {
  const router = Router();
  const todayOf = (query: unknown) => todayQuerySchema.parse(query).today;

  router.get('/', (req, res) => {
    res.json(container.manageGoals.list(todayOf(req.query)));
  });

  // Déclarés avant `/:id`.
  router.get('/catalog', (_req, res) => {
    res.json(container.manageGoals.catalog());
  });

  router.get('/preview', (req, res) => {
    const query = goalPreviewQuerySchema.parse(req.query);
    res.json(
      container.manageGoals.preview({
        metric: query.metric,
        entityId: query.entityId ?? null,
        startDate: query.startDate,
        endDate: query.endDate ?? null,
        today: query.today,
      }),
    );
  });

  router.post('/reorder', (req, res) => {
    res.json(container.manageGoals.reorder(reorderSchema.parse(req.body).ids, todayOf(req.query)));
  });

  router.post('/', (req, res) => {
    res
      .status(201)
      .json(container.manageGoals.create(createGoalSchema.parse(req.body), todayOf(req.query)));
  });

  router.patch('/:id', (req, res) => {
    res.json(
      container.manageGoals.update(
        param(req, 'id'),
        updateGoalSchema.parse(req.body),
        todayOf(req.query),
      ),
    );
  });

  router.delete('/:id', (req, res) => {
    container.manageGoals.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
