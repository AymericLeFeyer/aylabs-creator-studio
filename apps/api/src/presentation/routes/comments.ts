import { Router } from 'express';
import type { Container } from '../../container.ts';
import type { CommentStatus } from '../../domain/comment/entities/Comment.ts';
import { commentQuerySchema, commentStatsQuerySchema, updateCommentSchema } from '../validation.ts';
import { param } from '../helpers.ts';

/**
 * Les commentaires archivés, et le seul geste qu'on pose dessus : leur donner un statut.
 *
 * `/stats` et `/collect` sont déclarés **avant** toute route paramétrée — même vigilance
 * que `/overview` sur les productions.
 *
 * Il n'y a **pas de route de suppression**, et c'est délibéré : écarter un commentaire
 * se fait par le statut `ignored`, qui est ce qui permet de ne plus jamais le revoir tout
 * en se souvenant qu'on l'a déjà vu. Le supprimer le ferait revenir à la collecte
 * suivante, dans la file de tri.
 */
export const commentsRouter = (container: Container): Router => {
  const router = Router();

  /** Compte par statut, pour les pastilles des onglets sans charger les lignes. */
  router.get('/stats', (req, res) => {
    const query = commentStatsQuerySchema.parse(req.query);
    res.json(container.comments.countByStatus(query.channelIds));
  });

  router.post('/collect', async (_req, res) => {
    res.json(await container.collectComments.collectAll());
  });

  router.get('/', (req, res) => {
    const query = commentQuerySchema.parse(req.query);
    res.json(
      container.comments.findAll({
        statuses: query.statuses as CommentStatus[],
        channelIds: query.channelIds,
        range: query.from && query.to ? { from: query.from, to: query.to } : undefined,
        search: query.search,
        limit: query.limit,
      }),
    );
  });

  router.patch('/:id', (req, res) => {
    const body = updateCommentSchema.parse(req.body);
    res.json(container.comments.setStatus(param(req, 'id'), body.status));
  });

  return router;
};
