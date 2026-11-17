import { Router } from 'express';
import type { Container } from '../../container.ts';
import { updateAiSettingsSchema } from '../validation.ts';

/** Paramètres → API → Assistant IA. La clé n'en sort jamais : seulement sa provenance. */
export const aiRouter = (container: Container): Router => {
  const router = Router();

  router.get('/settings', (_req, res) => {
    res.json(container.manageAi.view());
  });

  /** La dépense réelle d'OpenAI (clé admin). Rend toujours 200 : l'erreur est dans le corps. */
  router.get('/spend', async (_req, res) => {
    res.json(await container.manageAi.spend());
  });

  router.patch('/settings', (req, res) => {
    res.json(container.manageAi.update(updateAiSettingsSchema.parse(req.body)));
  });

  return router;
};
