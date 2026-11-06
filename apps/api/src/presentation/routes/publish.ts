import { Router } from 'express';
import type { Container } from '../../container.ts';
import { param } from '../helpers.ts';

/**
 * Les fichiers de Production → Shorts, sous `/api/publish` parce que nginx y porte la
 * limite de 2 Go et l'envoi sans tampon (`location ^~ /api/publish/`).
 *
 * Le dépôt de la vidéo d'une publication est un **corps brut** (`Content-Type: video/*`, nom
 * dans `X-File-Name`, encodé), écrit en flux sur le disque. `express.json` ne lit que les
 * corps JSON et laisse celui-ci intact. C'est aussi la route qu'appelle l'outil de montage.
 *
 * `/files/:token` sert l'aperçu de l'écran, sans authentification comme le reste de l'API
 * (hors export et MCP) : le studio reste derrière le réseau privé.
 */
export const publishRouter = (container: Container): Router => {
  const router = Router();

  router.get('/targets', (_req, res) => {
    res.json(container.managePublishing.targets());
  });

  router.post('/drafts/:id/video', async (req, res) => {
    const rawName = req.header('x-file-name') ?? 'video';
    let fileName = rawName;
    try {
      fileName = decodeURIComponent(rawName);
    } catch {
      // Un nom mal encodé ne doit pas faire échouer l'envoi.
    }
    const mimeType = (req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    res
      .status(201)
      .json(await container.manageShorts.attachVideo(param(req, 'id'), req, fileName, mimeType));
  });

  router.delete('/drafts/:id/video', (req, res) => {
    res.json(container.manageShorts.removeVideo(param(req, 'id')));
  });

  /** La vidéo, pour l'aperçu. `sendFile` gère les `Range` (le lecteur avance sans tout charger). */
  router.get('/files/:token', (req, res, next) => {
    const { upload, path } = container.managePublishing.fileByToken(param(req, 'token'));
    res.setHeader('Content-Type', upload.mimeType);
    res.sendFile(path, { headers: { 'Cache-Control': 'private, max-age=3600' } }, (error) => {
      if (error && !res.headersSent) next(error);
    });
  });

  return router;
};
