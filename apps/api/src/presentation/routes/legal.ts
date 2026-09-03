import { Router } from 'express';
import type { Container } from '../../container.ts';
import {
  createLegalBookmarkSchema,
  createLegalObligationSchema,
  legalMonthParamSchema,
  updateCompanySchema,
  updateLegalBookmarkSchema,
  updateLegalObligationSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Le suivi administratif : la société, le référentiel des obligations mensuelles, et
 * les cases cochées mois par mois.
 *
 * `/overview` porte tout ce que l'écran Légal affiche — société, obligations, tableau
 * mensuel et alertes — en une requête : le statut d'une case se calcule côté API, et le
 * dashboard lit exactement les mêmes alertes que le tableau.
 */
export const legalRouter = (container: Container): Router => {
  const router = Router();

  router.get('/overview', (_req, res) => {
    res.json(container.getLegalOverview.execute());
  });

  router.get('/company', (_req, res) => {
    res.json(container.company.get());
  });

  router.patch('/company', (req, res) => {
    res.json(container.company.update(updateCompanySchema.parse(req.body)));
  });

  /**
   * Les liens utiles affichés au-dessus du tableau à cocher. Router à part de
   * `/overview` : ils ne dépendent ni du mois ni des cases, et se lisent aussi seuls
   * depuis l'écran de configuration (avec les archivés).
   */
  router.get('/bookmarks', (req, res) => {
    res.json(container.legalBookmarks.findAll(req.query.includeArchived === 'true'));
  });

  router.post('/bookmarks', (req, res) => {
    res
      .status(201)
      .json(container.legalBookmarks.create(createLegalBookmarkSchema.parse(req.body)));
  });

  router.patch('/bookmarks/:id', (req, res) => {
    res.json(
      container.legalBookmarks.update(param(req, 'id'), updateLegalBookmarkSchema.parse(req.body)),
    );
  });

  router.delete('/bookmarks/:id', (req, res) => {
    container.legalBookmarks.delete(param(req, 'id'));
    res.status(204).end();
  });

  router.get('/obligations', (req, res) => {
    res.json(container.legalObligations.findAll(req.query.includeArchived === 'true'));
  });

  router.post('/obligations', (req, res) => {
    res
      .status(201)
      .json(container.legalObligations.create(createLegalObligationSchema.parse(req.body)));
  });

  router.patch('/obligations/:id', (req, res) => {
    res.json(
      container.legalObligations.update(
        param(req, 'id'),
        updateLegalObligationSchema.parse(req.body),
      ),
    );
  });

  /** Supprime l'obligation : les cases cochées de tous les mois partent en cascade. */
  router.delete('/obligations/:id', (req, res) => {
    container.legalObligations.delete(param(req, 'id'));
    res.status(204).end();
  });

  /** Cocher est idempotent : recocher ne repousse pas la date de réalisation. */
  router.put('/checks/:obligationId/:month', (req, res) => {
    const month = legalMonthParamSchema.parse(param(req, 'month'));
    container.legalObligations.check(param(req, 'obligationId'), month);
    res.status(204).end();
  });

  router.delete('/checks/:obligationId/:month', (req, res) => {
    const month = legalMonthParamSchema.parse(param(req, 'month'));
    container.legalObligations.uncheck(param(req, 'obligationId'), month);
    res.status(204).end();
  });

  return router;
};
