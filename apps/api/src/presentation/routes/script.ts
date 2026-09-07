import { Router } from 'express';
import type { Container } from '../../container.ts';
import {
  createScriptPresetSchema,
  updateScriptPresetSchema,
  createShotAngleSchema,
  updateShotAngleSchema,
  reorderSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Les gabarits de script : CRUD nu, sans use case.
 *
 * Un gabarit n'a **aucun effet de bord** — c'est tout le sens de le copier plutôt que de
 * le référencer. En modifier un ne touche aucun script déjà écrit, en supprimer un non
 * plus : il n'y a rien à resynchroniser, donc rien qu'une route ne puisse faire seule.
 */
export const scriptPresetsRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(container.scriptPresets.findAll(req.query.includeArchived === 'true'));
  });

  router.post('/', (req, res) => {
    res.status(201).json(container.scriptPresets.create(createScriptPresetSchema.parse(req.body)));
  });

  /** Déclaré **avant** `/:id`, sinon Express prendrait « reorder » pour un identifiant. */
  router.post('/reorder', (req, res) => {
    container.scriptPresets.reorder(reorderSchema.parse(req.body).ids);
    res.status(204).end();
  });

  router.patch('/:id', (req, res) => {
    res.json(
      container.scriptPresets.update(param(req, 'id'), updateScriptPresetSchema.parse(req.body)),
    );
  });

  router.delete('/:id', (req, res) => {
    container.scriptPresets.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};

/**
 * Le référentiel des angles de vue : ceux qu'on utilise sur toutes les vidéos.
 *
 * `GET /` rend le référentiel seul. C'est `/api/productions/:id/shot-angles` qui rend la
 * liste **à plat** telle que l'éditeur la propose, référentiel et ponctuels réunis.
 */
export const shotAnglesRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(container.shotAngles.findGlobal(req.query.includeArchived === 'true'));
  });

  router.post('/', (req, res) => {
    res.status(201).json(container.shotAngles.createGlobal(createShotAngleSchema.parse(req.body)));
  });

  router.post('/reorder', (req, res) => {
    container.shotAngles.reorderGlobal(reorderSchema.parse(req.body).ids);
    res.status(204).end();
  });

  router.patch('/:id', (req, res) => {
    res.json(
      container.shotAngles.updateGlobal(param(req, 'id'), updateShotAngleSchema.parse(req.body)),
    );
  });

  router.delete('/:id', (req, res) => {
    container.shotAngles.deleteGlobal(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};

/**
 * Les angles **d'une vidéo** : le référentiel et le ponctuel réunis, à plat.
 *
 * Même contrat que `/api/productions/:id/todos`, et pour la même raison : l'éditeur
 * n'affiche qu'une liste, et la faire assembler par le front demanderait deux requêtes
 * puis un tri dupliqué — qui divergerait du tri du dépôt à la première retouche.
 *
 * Les écritures ne portent que sur le **ponctuel**. Retirer un angle du référentiel
 * depuis une fiche l'enlèverait de toutes les autres vidéos : ça se fait dans les
 * paramètres, exactement comme une tâche d'étape.
 */
export const productionShotAnglesRouter = (container: Container): Router => {
  const router = Router({ mergeParams: true });

  router.get('/', (req, res) => {
    res.json(container.shotAngles.listItems(param(req, 'id')));
  });

  router.post('/', (req, res) => {
    const input = createShotAngleSchema.parse(req.body);
    container.shotAngles.createForProduction({ ...input, productionId: param(req, 'id') });
    res.status(201).json(container.shotAngles.listItems(param(req, 'id')));
  });

  router.patch('/:angleId', (req, res) => {
    container.shotAngles.updateForProduction(
      param(req, 'angleId'),
      updateShotAngleSchema.parse(req.body),
    );
    res.json(container.shotAngles.listItems(param(req, 'id')));
  });

  router.delete('/:angleId', (req, res) => {
    container.shotAngles.deleteForProduction(param(req, 'angleId'));
    res.json(container.shotAngles.listItems(param(req, 'id')));
  });

  return router;
};
