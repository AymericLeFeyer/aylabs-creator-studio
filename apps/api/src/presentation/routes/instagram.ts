import { Router } from 'express';
import type { Container } from '../../container.ts';
import type { Granularity } from '../../shared/dates.ts';
import {
  createInstagramAccountSchema,
  instagramQuerySchema,
  updateInstagramAccountSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Instagram : les comptes, leur collecte, et l'écran qui les lit.
 *
 * `/overview`, `/accounts` et `/collect` sont déclarés **avant** toute route paramétrée —
 * même vigilance que `/overview` sur les productions.
 *
 * **Le jeton ne sort jamais.** Les routes de lecture passent par `findAll`, qui renvoie
 * des `InstagramAccountView` sans lui.
 */
export const instagramRouter = (container: Container): Router => {
  const router = Router();

  /** Séries, totaux, stories et publications de la période, en une requête. */
  router.get('/overview', (req, res) => {
    const query = instagramQuerySchema.parse(req.query);
    res.json(
      container.getInstagramOverview.execute({
        from: query.from,
        to: query.to,
        granularity: query.granularity as Granularity,
        accountIds: query.accountIds,
      }),
    );
  });

  router.get('/accounts', (req, res) => {
    res.json(container.instagramAccounts.findAll(req.query.includeArchived === 'true'));
  });

  router.post('/accounts', (req, res) => {
    const body = createInstagramAccountSchema.parse(req.body);
    const account = container.instagramAccounts.create(body);
    // On renvoie la vue, jamais l'entité : elle porterait le jeton qu'on vient d'écrire.
    res
      .status(201)
      .json(container.instagramAccounts.findAll(true).find((a) => a.id === account.id));
  });

  router.patch('/accounts/:id', (req, res) => {
    const body = updateInstagramAccountSchema.parse(req.body);
    const account = container.instagramAccounts.update(param(req, 'id'), body);
    res.json(container.instagramAccounts.findAll(true).find((a) => a.id === account.id));
  });

  /**
   * Supprime le compte **et tout son historique**.
   *
   * Plus définitif qu'ailleurs : les stories ne se recollectent pas, et ce qui part ici
   * ne pourra jamais être reconstitué. L'écran propose l'archivage d'abord.
   */
  router.delete('/accounts/:id', (req, res) => {
    container.instagramAccounts.delete(param(req, 'id'));
    res.status(204).end();
  });

  /** Collecte immédiate de tous les comptes. */
  router.post('/collect', async (_req, res) => {
    res.json(await container.collectInstagram.collectAll());
  });

  router.post('/accounts/:id/collect', async (req, res) => {
    res.json(await container.collectInstagram.collectOne(param(req, 'id')));
  });

  /** Échange le jeton contre un neuf, valable 60 jours de plus. */
  router.post('/accounts/:id/refresh-token', async (req, res) => {
    res.json(await container.collectInstagram.refreshToken(param(req, 'id')));
  });

  return router;
};
