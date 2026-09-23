import { Router } from 'express';
import type { Container } from '../../container.ts';
import { discordHistoryQuerySchema } from '../validation.ts';

/**
 * Discord : l'historique des relevés (`discord_snapshots`), un point par collecte.
 *
 * La collecte elle-même reste sous `/api/integrations/discord/collect` — cette route ne
 * fait que relire ce qu'elle a déjà écrit, même partage des rôles qu'avec Domadoo.
 */
export const discordRouter = (container: Container): Router => {
  const router = Router();

  router.get('/history', (req, res) => {
    const query = discordHistoryQuerySchema.parse(req.query);
    res.json(container.discordSnapshots.findInRange(query.from, query.to));
  });

  return router;
};
