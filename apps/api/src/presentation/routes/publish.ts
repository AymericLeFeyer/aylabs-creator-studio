import express, { Router } from 'express';
import { z } from 'zod';
import type { Container } from '../../container.ts';
import { param } from '../helpers.ts';

/** Une miniature générée, ou une image en base64 (vérifiée JPEG/PNG ≤ 2 Mo par le use case). */
const thumbnailSchema = z.union([
  z.object({ thumbnailId: z.string().min(1) }),
  z.object({ image: z.string().min(1).max(4_000_000) }),
]);

const youtubeSchema = z.object({
  channelId: z.string().min(1),
  title: z.string().trim().min(1).max(100),
  description: z.string().max(5000).default(''),
  tags: z.array(z.string().trim().min(1)).max(50).default([]),
  // Public est admis par l'API, mais l'écran ne le propose pas tant qu'on teste.
  privacy: z.enum(['private', 'unlisted', 'public']).default('private'),
  thumbnail: thumbnailSchema.optional(),
});

const instagramSchema = z.object({
  accountId: z.string().min(1),
  caption: z.string().max(2200).default(''),
  shareToFeed: z.boolean().default(true),
  coverImage: thumbnailSchema.optional(),
  coverOffsetMs: z.number().int().min(0).optional(),
});

const tiktokSchema = z.object({
  connectionId: z.string().min(1),
  mode: z.enum(['draft', 'private']).default('draft'),
  title: z.string().max(2200).default(''),
  coverOffsetMs: z.number().int().min(0).optional(),
});

const publishInstagramSchema = z.object({
  // Même garde que l'envoi d'un mail : une publication Instagram est publique.
  confirm: z.literal(true),
});

/**
 * Production → Publish (banc d'essai temporaire).
 *
 * Le dépôt d'une vidéo est un **corps brut** (`Content-Type: video/*`, nom dans
 * `X-File-Name`), écrit en flux sur le disque. `express.json` ne lit que les corps JSON et laisse
 * celui-ci intact ; nginx a sa propre limite pour cette route.
 *
 * `/files/:token` sert l'aperçu de l'écran, sans authentification comme le reste de l'API
 * (hors export et MCP) : le studio reste derrière le réseau privé.
 */
export const publishRouter = (container: Container): Router => {
  const router = Router();
  // Une miniature en base64 dépasse le parseur global de 1 Mo : monté avant lui.
  router.use(express.json({ limit: '5mb' }));
  const publish = container.managePublishTests;

  router.get('/targets', (_req, res) => {
    res.json(publish.targets());
  });

  router.get('/uploads', (_req, res) => {
    res.json(publish.list());
  });

  router.post('/uploads', async (req, res) => {
    const rawName = req.header('x-file-name') ?? 'video';
    let fileName = rawName;
    try {
      fileName = decodeURIComponent(rawName);
    } catch {
      // Un nom mal encodé ne doit pas faire échouer l'envoi.
    }
    const mimeType = (req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    res.status(201).json(await publish.receive(req, fileName, mimeType));
  });

  router.delete('/uploads/:id', (req, res) => {
    publish.delete(param(req, 'id'));
    res.status(204).end();
  });

  router.post('/uploads/:id/youtube', (req, res) => {
    res.status(202).json(publish.startYouTube(param(req, 'id'), youtubeSchema.parse(req.body)));
  });

  router.post('/uploads/:id/instagram', (req, res) => {
    res
      .status(202)
      .json(publish.prepareInstagram(param(req, 'id'), instagramSchema.parse(req.body)));
  });

  router.post('/uploads/:id/tiktok', async (req, res) => {
    res.status(202).json(await publish.startTikTok(param(req, 'id'), tiktokSchema.parse(req.body)));
  });

  router.post('/attempts/:id/youtube-thumbnail', async (req, res) => {
    res.json(await publish.setYouTubeThumbnail(param(req, 'id'), thumbnailSchema.parse(req.body)));
  });

  router.post('/attempts/:id/instagram-publish', async (req, res) => {
    publishInstagramSchema.parse(req.body);
    res.json(await publish.publishInstagram(param(req, 'id')));
  });

  /** La vidéo, pour l'aperçu. `sendFile` gère les `Range` (le lecteur avance sans tout charger). */
  router.get('/files/:token', (req, res, next) => {
    const { upload, path } = publish.fileByToken(param(req, 'token'));
    res.setHeader('Content-Type', upload.mimeType);
    res.sendFile(path, { headers: { 'Cache-Control': 'private, max-age=3600' } }, (error) => {
      if (error && !res.headersSent) next(error);
    });
  });

  return router;
};
