import { Router } from 'express';
import type { Container } from '../../container.ts';
import type { Granularity } from '../../shared/dates.ts';
import { amazonQuerySchema } from '../validation.ts';

/**
 * Affiliations → Amazon : l'historique reconstruit depuis `amazon_snapshots`.
 *
 * La collecte reste sous `/api/integrations/amazon/collect` — cette route ne fait que
 * relire ce que la collecte a déjà écrit, jour après jour.
 */
export const amazonRouter = (container: Container): Router => {
  const router = Router();

  router.get('/overview', (req, res) => {
    const query = amazonQuerySchema.parse(req.query);
    res.json(
      container.getAmazonOverview.execute({
        from: query.from,
        to: query.to,
        granularity: query.granularity as Granularity,
      }),
    );
  });

  return router;
};
