import express, { Router, type Response } from 'express';
import { z } from 'zod';
import type { Container } from '../../container.ts';
import type { ThumbnailImage } from '../../domain/thumbnail/entities/Thumbnail.ts';
import {
  addThumbnailAssetSchema,
  generateThumbnailSchema,
  saveThumbnailSchema,
  updateThumbnailSettingsSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';

const querySchema = z.object({
  productionId: z.string().min(1).optional(),
  saved: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

/** Une image donnée ne change jamais de contenu : son identifiant suffit à la mettre en cache. */
const sendImage = (res: Response, image: ThumbnailImage) => {
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.type(image.mimeType).send(Buffer.from(image.data));
};

/**
 * Production → Miniatures, et ses réglages.
 *
 * Monté **avant** le `express.json` global de 1 Mo, avec sa propre limite : une génération
 * transporte ses images en base64. Les adresses d'image n'ont **pas d'extension**, pour la
 * même raison que les icônes de `branding.ts` : nginx les chercherait sur le disque.
 */
export const thumbnailsRouter = (container: Container): Router => {
  const router = Router();
  router.use(express.json({ limit: '40mb' }));
  const thumbnails = container.manageThumbnails;

  router.get('/settings', (_req, res) => {
    res.json(thumbnails.view());
  });

  router.patch('/settings', (req, res) => {
    res.json(thumbnails.update(updateThumbnailSettingsSchema.parse(req.body)));
  });

  router.get('/assets', (_req, res) => {
    res.json(thumbnails.listAssets());
  });

  router.post('/assets', (req, res) => {
    const { label, image } = addThumbnailAssetSchema.parse(req.body);
    res.status(201).json(thumbnails.addAsset(label, image));
  });

  router.get('/assets/:id/image', (req, res) => {
    sendImage(res, thumbnails.assetImage(param(req, 'id')));
  });

  router.delete('/assets/:id', (req, res) => {
    thumbnails.deleteAsset(param(req, 'id'));
    res.status(204).end();
  });

  router.get('/', (req, res) => {
    res.json(thumbnails.list(querySchema.parse(req.query)));
  });

  router.post('/', async (req, res) => {
    res.status(201).json(await thumbnails.generate(generateThumbnailSchema.parse(req.body)));
  });

  router.post('/:id/save', (req, res) => {
    const { productionId } = saveThumbnailSchema.parse(req.body ?? {});
    res.json(thumbnails.save(param(req, 'id'), productionId));
  });

  router.delete('/:id/save', (req, res) => {
    res.json(thumbnails.unsave(param(req, 'id')));
  });

  router.get('/:id/image', (req, res) => {
    sendImage(res, thumbnails.image(param(req, 'id')));
  });

  router.delete('/:id', (req, res) => {
    thumbnails.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
