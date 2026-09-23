import { Router } from 'express';
import type { Container } from '../../container.ts';
import type { Granularity } from '../../shared/dates.ts';
import { tiktokQuerySchema, updateTikTokAccountSchema } from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * TikTok : le profil public suivi, ses relevés, et l'écran qui les lit.
 *
 * Pas de `POST /accounts` : contrairement à Instagram, un compte TikTok n'a rien à
 * connecter — il se crée tout seul au premier relevé du profil configuré dans
 * Paramètres → API (`/api/integrations/tiktok/collect`).
 */
export const tiktokRouter = (container: Container): Router => {
  const router = Router();

  router.get('/overview', (req, res) => {
    const query = tiktokQuerySchema.parse(req.query);
    res.json(
      container.getTikTokOverview.execute({
        from: query.from,
        to: query.to,
        granularity: query.granularity as Granularity,
        accountIds: query.accountIds,
      }),
    );
  });

  router.get('/accounts', (req, res) => {
    res.json(container.tiktokAccounts.findAll(req.query.includeArchived === 'true'));
  });

  router.patch('/accounts/:id', (req, res) => {
    const body = updateTikTokAccountSchema.parse(req.body);
    container.tiktokAccounts.update(param(req, 'id'), body);
    res
      .status(200)
      .json(container.tiktokAccounts.findAll(true).find((a) => a.id === param(req, 'id')));
  });

  /** Supprime le compte **et tout son historique** (cascade) : irrécupérable. */
  router.delete('/accounts/:id', (req, res) => {
    container.tiktokAccounts.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
