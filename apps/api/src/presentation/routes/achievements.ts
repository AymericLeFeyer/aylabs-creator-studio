import { Router } from 'express';
import type { Container } from '../../container.ts';

/**
 * Les achievements, recalculés à chaque lecture depuis l'historique (`GetAchievements`).
 * Aucun paramètre : ce sont des paliers de toute une vie, pas d'une période.
 */
export const achievementsRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(container.getAchievements.execute());
  });

  return router;
};
