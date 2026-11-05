import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../../container.ts';
import type { Granularity } from '../../shared/dates.ts';
import { tiktokQuerySchema, updateTikTokAccountSchema } from '../validation.ts';
import { param } from '../helpers.ts';

const completeSchema = z.object({ url: z.string().trim().min(1).max(4000) });

const queryValue = (value: unknown): string | null => (typeof value === 'string' ? value : null);

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

  // --- Connexion OAuth (publication depuis Production → Publish) -------------------

  router.get('/connections', (_req, res) => {
    res.json(container.manageTikTokConnection.status());
  });

  router.post('/oauth/start', (_req, res) => {
    res.json(container.manageTikTokConnection.start());
  });

  /**
   * Le retour de TikTok, atteint **par le navigateur** (TikTok n'appelle jamais le studio).
   * Toujours une redirection vers l'écran, avec le résultat dans l'adresse : une erreur
   * en JSON brut laisserait l'utilisateur sur une page illisible.
   */
  router.get('/oauth/callback', async (req, res) => {
    const target = new URLSearchParams({ onglet: 'tiktok' });
    try {
      await container.manageTikTokConnection.complete({
        code: queryValue(req.query.code),
        state: queryValue(req.query.state),
        error: queryValue(req.query.error),
        errorDescription: queryValue(req.query.error_description),
      });
      target.set('tiktok', 'connecte');
    } catch (error) {
      target.set('tiktok', 'erreur');
      target.set('message', error instanceof Error ? error.message.slice(0, 300) : 'erreur');
    }
    res.redirect(302, `/parametres?${target.toString()}`);
  });

  /** Le repli : l'adresse de retour collée dans l'écran. */
  router.post('/oauth/complete', async (req, res) => {
    const { url } = completeSchema.parse(req.body);
    res.json(await container.manageTikTokConnection.completeFromUrl(url));
  });

  router.delete('/connections/:id', (req, res) => {
    container.manageTikTokConnection.disconnect(param(req, 'id'));
    res.status(204).end();
  });

  /** Supprime le compte **et tout son historique** (cascade) : irrécupérable. */
  router.delete('/accounts/:id', (req, res) => {
    container.tiktokAccounts.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
