import { Router } from 'express';
import type { Container } from '../../container.ts';
import {
  createStepTodoSchema,
  updateStepTodoSchema,
  createProductionTodoSchema,
  reorderSchema,
  toggleTodoSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Le référentiel des tâches d'étape : ce qu'il y a à faire dans « montage », une fois
 * pour toutes les vidéos.
 *
 * Router à part de `/api/production-steps` parce qu'une tâche se lit aussi seule (la
 * modale d'une étape n'a pas besoin de recharger tout le référentiel des étapes), et
 * que la liste complète sert à calculer l'avancement de n'importe quelle vidéo.
 */
export const stepTodosRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(container.todos.findStepTodos(req.query.includeArchived === 'true'));
  });

  router.post('/', (req, res) => {
    res.status(201).json(container.todos.createStepTodo(createStepTodoSchema.parse(req.body)));
  });

  /** Déclaré **avant** `/:id`, sinon Express prendrait « reorder » pour un identifiant. */
  router.post('/reorder', (req, res) => {
    container.todos.reorderStepTodos(reorderSchema.parse(req.body).ids);
    res.status(204).end();
  });

  router.patch('/:id', (req, res) => {
    res.json(
      container.todos.updateStepTodo(param(req, 'id'), updateStepTodoSchema.parse(req.body)),
    );
  });

  router.delete('/:id', (req, res) => {
    container.todos.deleteStepTodo(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};

/**
 * Les tâches **d'une vidéo** : le référentiel et le ponctuel réunis, avec leur état.
 *
 * Toutes les écritures passent par `ManageTodos` et jamais par le dépôt : c'est lui qui
 * porte la règle « une étape est cochée exactement quand toutes ses tâches le sont ».
 * Une route qui cocherait en direct laisserait une étape terminée avec du reste à faire.
 */
export const productionTodosRouter = (container: Container): Router => {
  const router = Router({ mergeParams: true });

  router.get('/', (req, res) => {
    res.json(container.todos.listForProduction(param(req, 'id')));
  });

  /** Ajoute une tâche ponctuelle et renvoie la liste complète, déjà réordonnée. */
  router.post('/', (req, res) => {
    const body = createProductionTodoSchema.parse(req.body);
    res
      .status(201)
      .json(
        container.manageTodos.addProductionTodo(param(req, 'id'), body.stepId ?? null, body.label),
      );
  });

  router.put('/:todoId', (req, res) => {
    const { checked } = toggleTodoSchema.parse(req.body);
    res.json(container.manageTodos.toggle(param(req, 'id'), param(req, 'todoId'), checked));
  });

  /** Retire une tâche ponctuelle. Une tâche du référentiel se gère dans les paramètres. */
  router.delete('/:todoId', (req, res) => {
    container.manageTodos.removeProductionTodo(param(req, 'todoId'));
    res.status(204).end();
  });

  return router;
};
