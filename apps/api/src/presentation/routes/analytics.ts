import { Router } from 'express';
import type { Container } from '../../container.ts';
import { asyncHandler } from '../middleware/errorHandler.ts';
import { analyticsQuerySchema, resolveRange } from '../validation.ts';

export const analyticsRouter = (container: Container): Router => {
  const router = Router();

  /** Séries temporelles + cumuls du dashboard. C'est l'appel principal du front. */
  router.get('/', (req, res) => {
    const query = analyticsQuerySchema.parse(req.query);
    const range = resolveRange(query.from, query.to);

    res.json(
      container.getAnalytics.execute({
        from: range.from,
        to: range.to,
        granularity: query.granularity,
        channelIds: query.channelIds,
        includeUnassigned: query.includeUnassigned,
      }),
    );
  });

  /** Déclenche une collecte de toutes les chaînes, sans attendre le prochain cron. */
  router.post(
    '/collect',
    asyncHandler(async (_req, res) => {
      res.json({ results: await container.collectMetrics.collectAll() });
    }),
  );

  return router;
};
