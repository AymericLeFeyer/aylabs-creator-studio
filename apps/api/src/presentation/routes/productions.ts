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
  reorderSchema,
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

  /**
   * La fiche de mise en ligne de la sortie **précédente** de la même chaîne.
   *
   * Lue en direct sur YouTube, à la demande : c'est un geste ponctuel, et la stocker à la
   * collecte ne couvrirait que les vidéos parues après la migration. `null` quand la
   * chaîne n'a pas d'autre sortie connue — l'écran le dit plutôt que de préremplir du
   * vide.
   */
  router.get('/:id/previous-publication', async (req, res) => {
    res.json(await container.getPreviousPublication.execute(param(req, 'id')));
  });

  /** Rattache la sortie réelle, coche la publication et sort la vidéo de la file. */
  router.post('/:id/publish', (req, res) => {
    const { videoId } = publishProductionSchema.parse(req.body);
    res.json(container.manageProductions.publish(param(req, 'id'), videoId));
  });

  /**
   * Cocher une étape entraîne **ses tâches** : laisser des tâches ouvertes sous une
   * étape terminée la rouvrirait à la resynchronisation suivante, et le geste
   * paraîtrait ne pas avoir pris. La règle vit dans `ManageTodos`, jamais dans la route.
   */
  router.put('/:id/steps/:stepId', (req, res) => {
    container.manageTodos.toggleStep(param(req, 'id'), param(req, 'stepId'), true);
    res.status(204).end();
  });

  router.delete('/:id/steps/:stepId', (req, res) => {
    container.manageTodos.toggleStep(param(req, 'id'), param(req, 'stepId'), false);
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

  /**
   * Déclaré **avant** `/:id`, sinon Express prendrait « reorder » pour un identifiant —
   * même vigilance que `/overview` sur les productions.
   */
  router.post('/reorder', (req, res) => {
    container.productionSteps.reorder(reorderSchema.parse(req.body).ids);
    res.status(204).end();
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
