import { Router } from 'express';
import type { Container } from '../../container.ts';
import {
  createPostDraftSchema,
  postDraftQuerySchema,
  prepareVideoPostsSchema,
  updatePostDraftSchema,
} from '../validation.ts';
import { param } from '../helpers.ts';
import { notFound } from '../../shared/errors.ts';
import { VIDEO_POST_KIND_LABELS } from '../../domain/postDraft/entities/PostDraft.ts';
import { planVideoPosts } from '../../domain/postDraft/services/videoPosts.ts';

/**
 * Les publications de Production → Shorts.
 *
 * L'écriture des champs reste un CRUD nu ; tout ce qui touche à la vidéo et à la mise en
 * ligne (dépôt, suppression, « Publier maintenant ») passe par `ManageShorts`.
 */
export const postDraftsRouter = (container: Container): Router => {
  const router = Router();

  // `?archived=true` : les archives. Absent, la liste en cours. `?productionId=` : toutes
  // celles tirées de cette vidéo, archivées comprises.
  router.get('/', (req, res) => {
    const query = postDraftQuerySchema.parse(req.query);
    res.json(
      query.productionId
        ? container.postDrafts.findByProduction(query.productionId)
        : container.postDrafts.findAll({ archived: query.archived }),
    );
  });

  /**
   * « Préparer les publications » d'une vidéo terminée : un brouillon par type retenu,
   * rattaché à la vidéo, un jour chacun à partir de la sortie (`planVideoPosts`). Lecture
   * seule de la production : rien n'y est écrit. Déclaré avant `/:id`.
   */
  router.post('/prepare', (req, res) => {
    const input = prepareVideoPostsSchema.parse(req.body);
    const production = container.productions.findById(input.productionId);
    if (!production) throw notFound('Production');
    const title = production.publishTitle.trim() || production.title;
    const created = planVideoPosts(input.kinds, input.releaseDate).map(({ kind, date }) =>
      container.postDrafts.create({
        title: `${VIDEO_POST_KIND_LABELS[kind]} — ${title}`,
        plannedDate: date,
        productionId: production.id,
      }),
    );
    res.status(201).json(created);
  });

  /** Ce que lit la pastille du menu : dernière publication validée, et reste à faire. */
  router.get('/summary', (_req, res) => {
    res.json(container.postDrafts.summary());
  });

  router.post('/', (req, res) => {
    res.status(201).json(container.postDrafts.create(createPostDraftSchema.parse(req.body)));
  });

  router.patch('/:id', (req, res) => {
    res.json(container.postDrafts.update(param(req, 'id'), updatePostDraftSchema.parse(req.body)));
  });

  /**
   * « Publier maintenant » : avant le lancement, tout part tout de suite ; après, seules les
   * plateformes en échec sont relancées. 202 : les envois tournent en arrière-plan.
   */
  router.post('/:id/publish', (req, res) => {
    res.status(202).json(container.manageShorts.publishNow(param(req, 'id')));
  });

  // La vidéo déposée part avec la publication : passe par `ManageShorts`.
  router.delete('/:id', (req, res) => {
    container.manageShorts.delete(param(req, 'id'));
    res.status(204).end();
  });

  return router;
};
