import { Router } from 'express';
import type { Container } from '../../container.ts';
import type { ProductionStatus } from '../../domain/production/entities/Production.ts';
import {
  createProductionSchema,
  createProductionStepSchema,
  createSlotBodySchema,
  productionQuerySchema,
  publishProductionSchema,
  reorderProductionsSchema,
  slotQuerySchema,
  updateProductionSchema,
  updateProductionSlotSchema,
  updateProductionStepSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';
import { notFound } from '../../shared/errors.ts';

export const productionsRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (req, res) => {
    const query = productionQuerySchema.parse(req.query);
    res.json(
      container.productions.findAll({
        statuses: query.statuses as ProductionStatus[],
        channelIds: query.channelIds,
        range: query.from && query.to ? { from: query.from, to: query.to } : undefined,
        search: query.search,
      }),
    );
  });

  // Déclaré avant `/:id`, sinon Express prendrait « overview » pour un identifiant.
  router.get('/overview', (_req, res) => {
    res.json(container.getProductionOverview.execute());
  });

  router.get('/:id', (req, res) => {
    const production = container.productions.findViewById(param(req, 'id'));
    if (!production) throw notFound('Production');
    res.json(production);
  });

  router.post('/', (req, res) => {
    res
      .status(201)
      .json(container.manageProductions.create(createProductionSchema.parse(req.body)));
  });

  /** Réordonne toute la file d'un coup : le rang est la position dans le tableau reçu. */
  router.post('/reorder', (req, res) => {
    const { ids } = reorderProductionsSchema.parse(req.body);
    container.productions.reorder(ids);
    res.status(204).end();
  });

  router.patch('/:id', (req, res) => {
    res.json(
      container.manageProductions.update(param(req, 'id'), updateProductionSchema.parse(req.body)),
    );
  });

  router.delete('/:id', (req, res) => {
    container.manageProductions.remove(param(req, 'id'));
    res.status(204).end();
  });

  /** Rattache la sortie réelle, coche la publication et sort la vidéo de la file. */
  router.post('/:id/publish', (req, res) => {
    const { videoId } = publishProductionSchema.parse(req.body);
    res.json(container.manageProductions.publish(param(req, 'id'), videoId));
  });

  router.put('/:id/steps/:stepId', (req, res) => {
    container.productions.checkStep(param(req, 'id'), param(req, 'stepId'));
    res.status(204).end();
  });

  router.delete('/:id/steps/:stepId', (req, res) => {
    container.productions.uncheckStep(param(req, 'id'), param(req, 'stepId'));
    res.status(204).end();
  });

  return router;
};

/** Référentiel des étapes : les cases à cocher d'une vidéo sont des lignes, pas du code. */
export const productionStepsRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(container.productionSteps.findAll(req.query.includeArchived === 'true'));
  });

  router.post('/', (req, res) => {
    res
      .status(201)
      .json(container.productionSteps.create(createProductionStepSchema.parse(req.body)));
  });

  router.patch('/:id', (req, res) => {
    res.json(
      container.productionSteps.update(
        param(req, 'id'),
        updateProductionStepSchema.parse(req.body),
      ),
    );
  });

  router.delete('/:id', (req, res) => {
    container.productionSteps.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};

/** Créneaux de travail. Router à part : ils se lisent aussi hors d'une production (planning). */
export const productionSlotsRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (req, res) => {
    const query = slotQuerySchema.parse(req.query);
    res.json(
      container.productionSlots.findAll({
        productionIds: query.productionIds,
        range: query.from && query.to ? { from: query.from, to: query.to } : undefined,
        includeDone: query.includeDone,
      }),
    );
  });

  router.post('/', (req, res) => {
    res.status(201).json(container.productionSlots.create(createSlotBodySchema.parse(req.body)));
  });

  router.patch('/:id', (req, res) => {
    res.json(
      container.productionSlots.update(
        param(req, 'id'),
        updateProductionSlotSchema.parse(req.body),
      ),
    );
  });

  router.delete('/:id', (req, res) => {
    container.productionSlots.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
