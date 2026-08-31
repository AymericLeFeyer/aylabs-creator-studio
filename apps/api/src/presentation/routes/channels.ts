import { Router } from 'express';
import type { Container } from '../../container.ts';
import { toChannelView } from '../../domain/channel/entities/Channel.ts';
import { asyncHandler } from '../middleware/errorHandler.ts';
import { badRequest, notFound } from '../../shared/errors.ts';
import { toCents } from '../../shared/money.ts';
import {
  createChannelSchema,
  manualMetricSchema,
  manualSnapshotSchema,
  resolveChannelSchema,
  updateChannelSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';

export const channelsRouter = (container: Container): Router => {
  const router = Router();

  router.get('/', (req, res) => {
    const includeArchived = req.query.includeArchived === 'true';
    const channels = container.channels.findAll({ includeArchived });

    // On joint le dernier relevé connu : le front affiche les abonnés sans second appel.
    res.json(
      channels.map((channel) => ({
        ...toChannelView(channel),
        latestSnapshot: container.metrics.findLatestSnapshot(channel.id),
        lastMetricDate: container.metrics.findLastMetricDate(channel.id),
      })),
    );
  });

  /**
   * Résout un @handle ou une URL en identifiant de chaîne, avant création.
   * Évite d'aller chercher le UC... à la main dans le code source d'une page YouTube.
   */
  router.post(
    '/resolve',
    asyncHandler(async (req, res) => {
      if (!container.youtubeData) {
        throw badRequest(
          "YOUTUBE_API_KEY n'est pas configurée : impossible de rechercher une chaîne.",
        );
      }
      const { query } = resolveChannelSchema.parse(req.body);
      res.json(await container.youtubeData.resolveChannelId(query));
    }),
  );

  router.post('/', (req, res) => {
    const input = createChannelSchema.parse(req.body);

    if (input.mode === 'public' && !input.externalId) {
      throw badRequest('Une chaîne en mode public nécessite un identifiant de chaîne YouTube.');
    }
    if (input.mode === 'oauth' && !input.refreshToken) {
      throw badRequest('Une chaîne en mode OAuth nécessite un refresh token.');
    }
    if (input.externalId && container.channels.findByExternalId(input.externalId)) {
      throw badRequest('Cette chaîne YouTube est déjà suivie.');
    }

    res.status(201).json(toChannelView(container.channels.create(input)));
  });

  router.patch('/:id', (req, res) => {
    const input = updateChannelSchema.parse(req.body);
    res.json(toChannelView(container.channels.update(param(req, 'id'), input)));
  });

  router.delete('/:id', (req, res) => {
    // Les métriques et snapshots partent en cascade ; les revenus sont détachés
    // (channel_id passe à NULL) pour ne pas effacer un historique d'argent.
    container.channels.delete(param(req, 'id'));
    res.status(204).end();
  });

  /** Force une collecte immédiate pour cette chaîne. */
  router.post(
    '/:id/collect',
    asyncHandler(async (req, res) => {
      res.json(await container.collectMetrics.collectById(param(req, 'id')));
    }),
  );

  /** Saisie manuelle des métriques d'un jour : fait autorité sur la collecte. */
  router.put('/:id/metrics', (req, res) => {
    const channel = container.channels.findById(param(req, 'id'));
    if (!channel) throw notFound('Chaîne');

    const input = manualMetricSchema.parse(req.body);
    container.metrics.upsertDailyMetrics([
      {
        channelId: channel.id,
        date: input.date,
        views: input.views,
        watchMinutes: input.watchMinutes,
        averageViewDurationSec: input.views > 0 ? (input.watchMinutes * 60) / input.views : 0,
        subscribersGained: input.subscribersGained,
        subscribersLost: input.subscribersLost,
        likes: input.likes,
        comments: input.comments,
        shares: input.shares,
        estimatedRevenueCents: toCents(input.estimatedRevenue),
        source: 'manual',
      },
    ]);

    res.json(container.metrics.findDailyMetric(channel.id, input.date));
  });

  router.delete('/:id/metrics/:date', (req, res) => {
    container.metrics.deleteDailyMetric(param(req, 'id'), param(req, 'date'));
    res.status(204).end();
  });

  /** Saisie manuelle d'un total d'abonnés à une date (utile pour amorcer un historique). */
  router.put('/:id/snapshots', (req, res) => {
    const channel = container.channels.findById(param(req, 'id'));
    if (!channel) throw notFound('Chaîne');

    const input = manualSnapshotSchema.parse(req.body);
    container.metrics.upsertSnapshot({
      channelId: channel.id,
      date: input.date,
      capturedAt: new Date().toISOString(),
      subscribers: input.subscribers,
      totalViews: input.totalViews,
      totalVideos: input.totalVideos,
      source: 'manual',
    });

    res.json(container.metrics.findLatestSnapshotAt(channel.id, input.date));
  });

  return router;
};
