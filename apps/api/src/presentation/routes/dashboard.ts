import { Router } from 'express';
import type { Container } from '../../container.ts';
import {
  createDashboardWidgetSchema,
  reorderSchema,
  updateDashboardWidgetSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Les blocs du dashboard. CRUD nu, sans use case : aucun effet de bord.
 *
 * La base est la seule source : tous les appareils relisent la même liste (le front la
 * relit à intervalle court et au retour sur l'onglet), si bien qu'un bloc ajouté depuis
 * le téléphone apparaît sur l'ordinateur sans rien faire.
 */
export const dashboardRouter = (container: Container): Router => {
  const router = Router();

  router.get('/widgets', (_req, res) => {
    res.json(container.dashboardWidgets.findAll());
  });

  router.post('/widgets', (req, res) => {
    res
      .status(201)
      .json(container.dashboardWidgets.create(createDashboardWidgetSchema.parse(req.body)));
  });

  // Déclaré avant `/:id`.
  router.post('/widgets/reorder', (req, res) => {
    res.json(container.dashboardWidgets.reorder(reorderSchema.parse(req.body).ids));
  });

  router.patch('/widgets/:id', (req, res) => {
    res.json(
      container.dashboardWidgets.update(
        param(req, 'id'),
        updateDashboardWidgetSchema.parse(req.body),
      ),
    );
  });

  router.delete('/widgets/:id', (req, res) => {
    container.dashboardWidgets.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
