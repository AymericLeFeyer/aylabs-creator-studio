import { Router } from 'express';
import type { Container } from '../../container.ts';
import {
  approveSlotSchema,
  slotFromTimeEntrySchema,
  startSlotTimerSchema,
  planningBoardQuerySchema,
  planningSettingsSchema,
  planTargetsSchema,
  reorderPlanningItemsSchema,
  replaceWorkHoursSchema,
  replanSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Le planning.
 *
 * Toutes les écritures passent par `ManagePlanning` et **jamais** par les dépôts :
 * approuver un créneau enregistre une session de travail, ferme une ligne de pile,
 * publie dans l'agenda et peut reposer un créneau ailleurs. Un chemin qui
 * court-circuiterait le use case en oublierait forcément un.
 *
 * `/calendars`, `/settings`, `/work-hours`, `/items` et `/replan` sont déclarés **avant**
 * toute route paramétrée : même vigilance que `/overview` sur les productions.
 */
export const planningRouter = (container: Container): Router => {
  const router = Router();

  /** La grille, ses occupations et la pile de travail, en une requête. */
  router.get('/board', async (req, res) => {
    const query = planningBoardQuerySchema.parse(req.query);
    res.json(await container.managePlanning.board(query.from, query.to));
  });

  // --- Réglages -------------------------------------------------------------

  router.get('/settings', (_req, res) => {
    res.json(container.managePlanning.settingsView());
  });

  router.patch('/settings', (req, res) => {
    container.planningSettings.update(planningSettingsSchema.parse(req.body));
    res.json(container.managePlanning.settingsView());
  });

  /** Les entités calendrier de l'instance, pour le sélecteur des réglages. */
  router.get('/calendars', async (_req, res) => {
    res.json(await container.managePlanning.listCalendars());
  });

  router.get('/work-hours', (_req, res) => {
    res.json(container.workHours.findAll());
  });

  /** Remplacement total de la grille : le formulaire envoie l'état complet. */
  router.put('/work-hours', (req, res) => {
    const { ranges } = replaceWorkHoursSchema.parse(req.body);
    res.json(container.workHours.replaceAll(ranges));
  });

  // --- La pile de travail ---------------------------------------------------

  router.get('/items', (_req, res) => {
    res.json(container.planningItems.findAll({ statuses: ['pending'] }));
  });

  /** Ajoute une vidéo au planning : les étapes et tâches cochées entrent dans la pile. */
  router.post('/items', async (req, res) => {
    const body = planTargetsSchema.parse(req.body);
    res
      .status(201)
      .json(
        await container.managePlanning.addTargets(
          { productionId: body.productionId, stepIds: body.stepIds, todoIds: body.todoIds },
          { from: body.from, nowMinutes: body.nowMinutes },
        ),
      );
  });

  router.post('/items/reorder', async (req, res) => {
    const body = reorderPlanningItemsSchema.parse(req.body);
    res.json(
      await container.managePlanning.reorderItems(body.ids, { nowMinutes: body.nowMinutes }),
    );
  });

  router.delete('/items/:id', async (req, res) => {
    await container.managePlanning.removeItem(param(req, 'id'));
    res.status(204).end();
  });

  // --- Placement et approbation ---------------------------------------------

  /**
   * Repositionne les créneaux suggérés. Sans `onlyDate`, c'est tout l'horizon ; avec,
   * c'est la seule colonne visée — le bouton « réorganiser » d'un jour.
   */
  router.post('/replan', async (req, res) => {
    const body = replanSchema.parse(req.body);
    res.json(await container.managePlanning.replan(body));
  });

  /**
   * « J'ai passé ce temps là-dessus. » `finished` dit si la tâche est terminée ; sinon
   * un créneau de même durée est reposé, et c'est lui qui est renvoyé.
   */
  router.post('/slots/:id/approve', async (req, res) => {
    const body = approveSlotSchema.parse(req.body);
    const next = await container.managePlanning.approve(
      param(req, 'id'),
      { finished: body.finished, minutes: body.minutes, notes: body.notes },
      { from: body.from, nowMinutes: body.nowMinutes },
    );
    res.json({ next });
  });

  /**
   * Matérialise une session de travail dans le planning.
   *
   * `date` et `startTime` viennent du navigateur : `startedAt` est en UTC, et l'API
   * tourne dans un conteneur qui l'est aussi — en extraire l'heure ici poserait le
   * créneau deux heures trop tôt en été.
   */
  router.post('/time-entries/:id/slot', async (req, res) => {
    const body = slotFromTimeEntrySchema.parse(req.body);
    res.status(201).json(await container.managePlanning.slotFromTimeEntry(param(req, 'id'), body));
  });

  /**
   * Démarre le chronomètre sur un créneau.
   *
   * À l'arrêt, `POST /api/production-time/:id/stop` recalera ce créneau sur les horaires
   * réellement passés — c'est le lien `time_entry_id` qui le permet.
   */
  router.post('/slots/:id/start-timer', (req, res) => {
    const body = startSlotTimerSchema.parse(req.body);
    res.status(201).json(container.managePlanning.startTimerOnSlot(param(req, 'id'), body));
  });

  /** Défait une approbation : la session de travail part, le créneau redevient mobile. */
  router.post('/slots/:id/unapprove', (req, res) => {
    container.managePlanning.unapprove(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
