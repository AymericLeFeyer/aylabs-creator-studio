import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../../container.ts';
import { STORAGE_PURGE_KINDS } from '../../domain/storage/entities/Storage.ts';

const purgeSchema = z.object({
  kind: z.enum(STORAGE_PURGE_KINDS),
  olderThanDays: z.number().int().min(0).max(3650).default(0),
  compact: z.boolean().default(true),
});

/** Paramètres → Stockage : ce que le studio garde, et de quoi le purger. */
export const storageRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(container.manageStorage.overview());
  });

  router.post('/purge', (req, res) => {
    const { kind, olderThanDays, compact } = purgeSchema.parse(req.body);
    res.json(container.manageStorage.purge(kind, olderThanDays, compact));
  });

  router.post('/compact', (_req, res) => {
    res.json(container.manageStorage.compact());
  });

  return router;
};
