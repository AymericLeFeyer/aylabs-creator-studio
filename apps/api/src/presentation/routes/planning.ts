import { Router } from 'express';
import type { Container } from '../../container.ts';
import {
  approveSlotSchema,
  continueSlotSchema,
  placeSlotSchema,
  slotFromTimeEntrySchema,
  startSlotTimerSchema,
  planningBoardQuerySchema,
  planningSettingsSchema,
  planTargetsSchema,
  replaceWorkHoursSchema,
  replanSchema,
  todoPlacementSchema,
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
    res.json(await container.managePlanning.board(query.from, query.to, query.today));
  });

  // --- Réglages -------------------------------------------------------------

  router.get('/settings', (_req, res) => {
    res.json(container.managePlanning.settingsView());
  });

  router.patch('/settings', (req, res) => {
    const { todoBaseUrl, todoApiKey, todoTags, ...rest } = planningSettingsSchema.parse(req.body);
    container.planningSettings.update(rest);
    // La connexion à Todo passe par son use case : c'est lui, et lui seul, qui chiffre la clé.
    container.manageTodoTasks.updateConnection({
      baseUrl: todoBaseUrl,
      apiKey: todoApiKey,
      tags: todoTags,
    });
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
          { from: body.from, nowDate: body.nowDate, nowMinutes: body.nowMinutes },
        ),
      );
  });

  /**
   * Vide la pile d'un coup : tout ce qui est encore à faire, et ses créneaux non vécus.
   *
   * Déclaré **avant** `/items/:id` par simple lisibilité — Express distingue déjà les deux
   * chemins —, et pour la même raison qu'ailleurs : le plus général en premier.
   */
  router.delete('/items', (_req, res) => {
    res.json({ removed: container.managePlanning.clearItems() });
  });

  /**
   * Retire une ligne de la pile, et ses créneaux non vécus avec elle.
   *
   * **Rien n'est replanifié** : retirer une tâche ne doit pas réécrire la journée. C'est
   * au bouton « Repositionner » de le décider.
   */
  router.delete('/items/:id', (req, res) => {
    container.managePlanning.removeItem(param(req, 'id'));
    res.status(204).end();
  });

  // --- Placement et approbation ---------------------------------------------

  /**
   * Repositionne les créneaux suggérés — **le seul endroit qui réécrit la journée**.
   *
   * Tout le reste (ajouter une vidéo, approuver, arrêter un chronomètre) se contente de
   * poser ce qui manque sans rien déplacer. Réécrire l'agenda est une décision, pas un
   * effet de bord.
   *
   * Sans `onlyDate`, c'est tout l'horizon ; avec, la seule colonne visée.
   */
  router.post('/replan', async (req, res) => {
    const body = replanSchema.parse(req.body);
    res.json(await container.managePlanning.replan({ ...body, mode: 'full' }));
  });

  /**
   * Pose un créneau à la main sur une ligne de la pile : le glisser-déposer depuis la
   * colonne « En cours ».
   *
   * Le créneau naît `manual`, donc immobile, et **rien n'est replanifié**. Déclaré avant
   * `/slots/:id/...` par lisibilité, comme `/items` avant `/items/:id`.
   */
  router.post('/slots', (req, res) => {
    const body = placeSlotSchema.parse(req.body);
    res.status(201).json(
      container.managePlanning.placeItem(body.itemId, {
        date: body.date,
        startTime: body.startTime,
        minutes: body.minutes,
      }),
    );
  });

  /**
   * « Continuer le travail » : le clic droit sur un créneau. Un nouveau créneau à
   * approuver, sur la même tâche, à l'heure envoyée par le navigateur. Rien n'est replanifié.
   */
  router.post('/slots/:id/continue', (req, res) => {
    const body = continueSlotSchema.parse(req.body);
    res.status(201).json(container.managePlanning.continueSlot(param(req, 'id'), body));
  });

  /**
   * « J'ai passé ce temps là-dessus. » `finished` dit si la tâche est terminée ; sinon
   * un créneau de même durée est reposé, et c'est lui qui est renvoyé.
   */
  router.post('/slots/:id/approve', async (req, res) => {
    const body = approveSlotSchema.parse(req.body);
    const next = await container.managePlanning.approve(
      param(req, 'id'),
      {
        finished: body.finished,
        minutes: body.minutes,
        notes: body.notes,
        startTime: body.startTime,
      },
      { from: body.from, nowDate: body.nowDate, nowMinutes: body.nowMinutes },
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

  // --- Les tâches de l'app Todo ---------------------------------------------

  /** Cocher : l'écriture part dans Todo, qui reste la source de vérité. */
  router.post('/todo-tasks/:id/complete', async (req, res) => {
    await container.manageTodoTasks.setDone(param(req, 'id'), true);
    res.status(204).end();
  });

  router.post('/todo-tasks/:id/uncomplete', async (req, res) => {
    await container.manageTodoTasks.setDone(param(req, 'id'), false);
    res.status(204).end();
  });

  /**
   * Donne une heure à une tâche. Sur un autre jour que son échéance, l'échéance suit dans
   * Todo. **Rien n'est replanifié** : le prochain « Repositionner » en tiendra compte.
   */
  router.put('/todo-tasks/:id/placement', async (req, res) => {
    const body = todoPlacementSchema.parse(req.body);
    res.json(await container.manageTodoTasks.place(param(req, 'id'), body));
  });

  /** Retire l'heure : la tâche retourne sous son jour, sans rien écrire dans Todo. */
  router.delete('/todo-tasks/:id/placement', (req, res) => {
    container.manageTodoTasks.unplace(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
