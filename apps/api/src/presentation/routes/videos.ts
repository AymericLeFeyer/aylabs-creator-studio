import { Router } from 'express';
import type { Container } from '../../container.ts';
import { liveVideosSchema, setVideoHiddenSchema, videoQuerySchema } from '../validation.ts';
import { param } from '../helpers.ts';

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
        hidden: query.hidden,
        live: query.live || undefined,
      }),
    );
  });

  /** Un POST : le relevé réécrit les compteurs et consomme du quota YouTube. */
  router.post('/live', async (req, res) => {
    res.json(await container.refreshLiveVideoStats.execute(liveVideosSchema.parse(req.body)));
  });

  /** Masquer / réafficher dans « Dernières sorties » — rien d'autre ne lit ce drapeau. */
  router.patch('/:id', (req, res) => {
    const { hidden } = setVideoHiddenSchema.parse(req.body);
    const id = param(req, 'id');
    if (hidden === undefined) {
      res.json(container.videos.setNotLive(id));
      return;
    }
    res.json(container.videos.setHidden(id, hidden));
  });

  return router;
};
