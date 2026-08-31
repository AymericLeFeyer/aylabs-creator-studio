import { Router } from 'express';
import type { Container } from '../../container.ts';
import { videoQuerySchema } from '../validation.ts';

/**
 * Liste des sorties de vidéo, pour le sélecteur « rattacher à une vidéo » des
 * formulaires de revenu et de dépense.
 *
 * La période est **facultative** ici, contrairement au dashboard : on doit pouvoir
 * rattacher une sponso encaissée aujourd'hui à une vidéo sortie il y a six mois.
 */
export const videosRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (req, res) => {
    const query = videoQuerySchema.parse(req.query);
    res.json(
      container.videos.findAllWithChannel({
        range: query.from && query.to ? { from: query.from, to: query.to } : undefined,
        channelIds: query.channelIds,
        limit: query.limit,
      }),
    );
  });

  return router;
};
