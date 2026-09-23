import { Router } from 'express';
import type { Container } from '../../container.ts';
import type { Granularity } from '../../shared/dates.ts';
import { domadooQuerySchema } from '../validation.ts';

/**
 * Affiliations → Domadoo : l'historique reconstruit depuis `domadoo_snapshots`.
 *
 * La collecte elle-même reste sous `/api/integrations/domadoo/collect` — cette route ne
 * fait que relire ce que la collecte a déjà écrit, jour après jour.
 */
export const domadooRouter = (container: Container): Router => {
  const router = Router();

  router.get('/overview', (req, res) => {
    const query = domadooQuerySchema.parse(req.query);
    res.json(
      container.getDomadooOverview.execute({
        from: query.from,
        to: query.to,
        granularity: query.granularity as Granularity,
      }),
    );
  });

  return router;
};
