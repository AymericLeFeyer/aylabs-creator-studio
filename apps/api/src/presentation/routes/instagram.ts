import { Router } from 'express';
import type { Container } from '../../container.ts';
import type { Granularity } from '../../shared/dates.ts';
import {
  storyCountSchema,
  storyDateSchema,
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

  /**
   * Les stories d'un jour, **déclarées à la main** : ni le profil public ni aucune voie
   * sans jeton ne les expose. Le jour vient du navigateur (`:date`), jamais de l'horloge du
   * serveur, qui tourne en UTC.
   */
  router.get('/stories/:date', (req, res) => {
    const date = storyDateSchema.parse(param(req, 'date'));
    res.json({ date, count: container.instagramData.manualStoryCount(date) });
  });

  /** `{ count }` remplace la saisie du jour ; `0` l'efface. */
  router.put('/stories/:date', (req, res) => {
    const date = storyDateSchema.parse(param(req, 'date'));
    const { count } = storyCountSchema.parse(req.body);
    container.instagramData.setManualStoryCount(date, count);
    res.json({ date, count });
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

  /**
   * Collecte immédiate de tous les comptes — ceux à jeton par l'API Graph, et le profil
   * public de Paramètres → API s'il est renseigné. Le bouton de l'écran ne doit pas
   * dépendre de la voie par laquelle un compte est suivi.
   *
   * Le relevé du profil note son échec dans son instantané (visible dans Paramètres → API)
   * sans faire échouer la réponse : les comptes à jeton ont peut-être déjà sauvé leurs
   * stories.
   */
  router.post('/collect', async (_req, res) => {
    const results = await container.collectInstagram.collectAll();
    if (container.manageIntegrations.resolve('instagram').missing.length === 0) {
      await container.collectIntegrations.collectOne('instagram').catch((error: unknown) => {
        // Seul le verrou lève ici : le passage horaire est déjà en train de le relever.
        console.warn('[instagram] profil public :', error);
      });
    }
    res.json(results);
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
