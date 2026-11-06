import type { Readable } from 'node:stream';
import {
  type PostDraft,
  type PostDraftStep,
} from '../../../domain/postDraft/entities/PostDraft.ts';
import type { PostDraftRepository } from '../../../domain/postDraft/repositories/PostDraftRepository.ts';
import type { ProductionRepository } from '../../../domain/production/repositories/ProductionRepository.ts';
import type { PublishAttempt, PublishPlatform } from '../../../domain/publish/entities/Publish.ts';
import { badRequest, conflict, notFound } from '../../../shared/errors.ts';
import type { ManagePublishing } from '../../publish/usecases/ManagePublishing.ts';
import type { ThumbnailImage } from '../../../domain/thumbnail/entities/Thumbnail.ts';
import { imageMimeType } from '../../../domain/thumbnail/services/imageType.ts';

/** Une miniature générée (Production → Miniatures), lue par son identifiant. */
export type ThumbnailImageReader = (id: string) => ThumbnailImage;

/** La limite de YouTube pour une miniature (Instagram en admet 8). */
const MAX_COVER_BYTES = 2 * 1024 ** 2;

/** La fréquence à laquelle on regarde si une publication est arrivée à son heure. */
const TICK_MS = 30_000;

/** Un envoi encore en route : ni réussi, ni échoué. */
const RUNNING = new Set(['uploading', 'processing', 'publishing']);

/**
 * Ce qu'un envoi réussi coche sur la publication. TikTok n'arrive qu'en **brouillon** dans
 * l'app : rien n'est encore en ligne, la case reste à cocher une fois publié depuis le
 * téléphone.
 */
const STEP_OF: Partial<Record<PublishPlatform, PostDraftStep>> = {
  youtube: 'youtube',
  instagram: 'instagram',
};

/**
 * Production → Shorts : la publication d'un short, du titre noté en vitesse à la mise en
 * ligne sur les trois plateformes.
 *
 * Deux temps : on note le titre (et la date) pour savoir à peu près ce qui sort quand, puis
 * la **vidéo** arrive — glissée sur l'écran, ou envoyée par l'outil de montage. Une
 * publication qui a sa vidéo, une heure et au moins une plateforme **part toute seule** à
 * l'heure dite (`tick`, toutes les 30 s), ou tout de suite sur « Publier maintenant ».
 *
 * `publish_started_at` est posé **avant** tout envoi, par un `UPDATE … WHERE … IS NULL` :
 * c'est la seule garde contre une double mise en ligne (deux passages du minuteur, un clic
 * pendant un passage). Un redémarrage pendant un envoi le laisse en échec, jamais relancé
 * tout seul : « Réessayer » relance les plateformes en échec, et elles seules.
 */
export class ManageShorts {
  private readonly postDrafts: PostDraftRepository;
  private readonly productions: ProductionRepository;
  private readonly publishing: ManagePublishing;
  private readonly thumbnailImage: ThumbnailImageReader;

  constructor(
    postDrafts: PostDraftRepository,
    productions: ProductionRepository,
    publishing: ManagePublishing,
    thumbnailImage: ThumbnailImageReader,
  ) {
    this.thumbnailImage = thumbnailImage;
    this.postDrafts = postDrafts;
    this.productions = productions;
    this.publishing = publishing;
    publishing.prune(postDrafts.linkedUploadIds());
  }

  /** Démarre le minuteur (une fois, au lancement du serveur). */
  start(): void {
    const tick = () => void this.tick();
    tick();
    setInterval(tick, TICK_MS).unref();
  }

  private find(id: string): PostDraft {
    const draft = this.postDrafts.findById(id);
    if (!draft) throw notFound('Publication');
    return draft;
  }

  /**
   * La vidéo d'une publication. En remplacer une efface la précédente ; c'est refusé une
   * fois la mise en ligne lancée (ses envois porteraient sur un autre fichier). Arrivée,
   * elle coche « Montage » : le short est fait.
   */
  async attachVideo(
    id: string,
    body: Readable,
    fileName: string,
    mimeType: string,
  ): Promise<PostDraft> {
    const draft = this.find(id);
    if (draft.publishStartedAt) throw conflict('La mise en ligne est déjà lancée');
    const upload = await this.publishing.receive(body, fileName, mimeType);
    // Relue après l'envoi : la publication a pu être supprimée ou lancée entre-temps.
    const current = this.postDrafts.findById(id);
    if (!current || current.publishStartedAt) {
      this.publishing.deleteUpload(upload.id);
      throw current ? conflict('La mise en ligne est déjà lancée') : notFound('Publication');
    }
    const { previousUploadId } = this.postDrafts.setVideo(id, upload.id);
    if (previousUploadId) this.publishing.deleteUpload(previousUploadId);
    if (!current.steps.includes('montage')) {
      this.postDrafts.update(id, { steps: [...current.steps, 'montage'] });
    }
    return this.find(id);
  }

  removeVideo(id: string): PostDraft {
    const draft = this.find(id);
    if (draft.publishStartedAt) throw conflict('La mise en ligne est déjà lancée');
    const { previousUploadId } = this.postDrafts.setVideo(id, null);
    if (previousUploadId) this.publishing.deleteUpload(previousUploadId);
    return this.find(id);
  }

  /**
   * La couverture : une image envoyée par l'écran (le navigateur la ramène en JPEG de 2 Mo au
   * plus — la limite de YouTube), ou une miniature de Production → Miniatures, **copiée** :
   * la supprimer là-bas ne la retire pas d'ici.
   */
  setCover(id: string, source: { image: string } | { thumbnailId: string } | null): PostDraft {
    this.find(id);
    if (!source) {
      this.postDrafts.setCover(id, null);
      return this.find(id);
    }
    const data =
      'thumbnailId' in source
        ? this.thumbnailImage(source.thumbnailId).data
        : Buffer.from(source.image.replace(/^data:[^,]*,/, ''), 'base64');
    const mimeType = imageMimeType(data);
    if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
      throw badRequest('Couverture : JPEG ou PNG attendu');
    }
    if (data.length > MAX_COVER_BYTES) throw badRequest('Couverture : 2 Mo maximum (YouTube)');
    this.postDrafts.setCover(id, { data: Buffer.from(data), mimeType });
    return this.find(id);
  }

  cover(id: string): { data: Buffer; mimeType: string } {
    const cover = this.postDrafts.cover(id);
    if (!cover) throw notFound('Couverture');
    return cover;
  }

  /** Supprimer une publication emporte sa vidéo (ce qui est en ligne y reste). */
  delete(id: string): void {
    const draft = this.find(id);
    this.postDrafts.delete(id);
    if (draft.video) this.publishing.deleteUpload(draft.video.id);
  }

  /**
   * « Publier maintenant » : avant le lancement, l'heure devient maintenant et tout part ;
   * après, on relance **seulement** les plateformes dont le dernier envoi a échoué — une
   * plateforme en ligne ou en cours n'est jamais renvoyée.
   */
  publishNow(id: string): PostDraft {
    const draft = this.find(id);
    if (!draft.video) throw badRequest('La vidéo n’est pas encore arrivée');
    if (draft.archivedAt) throw conflict('Publication archivée');
    if (!draft.publishStartedAt) {
      if (draft.platforms.length === 0) throw badRequest('Aucune plateforme choisie');
      const now = new Date().toISOString();
      this.postDrafts.update(id, { scheduledAt: now });
      if (!this.postDrafts.markStarted(id, now)) throw conflict('La mise en ligne est déjà lancée');
      this.launch(this.find(id), draft.platforms);
      return this.find(id);
    }
    const failed = draft.platforms.filter((platform) => {
      const last = draft.attempts.find((attempt) => attempt.platform === platform);
      return !last || last.status === 'failed';
    });
    if (failed.length === 0) throw conflict('Rien à relancer : tout est en ligne ou en cours');
    this.launch(draft, failed);
    return this.find(id);
  }

  /** Les publications arrivées à leur heure partent. */
  async tick(): Promise<void> {
    const now = new Date().toISOString();
    for (const draft of this.postDrafts.findDue(now)) {
      if (!this.postDrafts.markStarted(draft.id, now)) continue;
      console.log(`[shorts] Mise en ligne de « ${draft.title} » (${draft.platforms.join(', ')})`);
      this.launch(draft, draft.platforms);
    }
  }

  /**
   * Lance chaque plateforme en parallèle — quelques minutes d'écart entre elles ne gênent
   * pas. Un envoi réussi coche sa case ; un échec reste lisible sur la ligne.
   */
  private launch(draft: PostDraft, platforms: readonly PublishPlatform[]): void {
    const video = draft.video;
    if (!video) return;
    const production = draft.productionId ? this.productions.findById(draft.productionId) : null;
    const cover = this.postDrafts.cover(draft.id);
    for (const platform of platforms) {
      try {
        const { done } = this.publishing.publish(platform, video.id, {
          title: draft.title,
          description: draft.description,
          options: draft.options,
          cover,
          preferredChannelId: production?.channelId ?? null,
        });
        void done.then((attempt) => this.onDone(draft.id, attempt));
      } catch (error) {
        console.warn(`[shorts] ${platform} : ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  private onDone(draftId: string, attempt: PublishAttempt): void {
    if (RUNNING.has(attempt.status)) return;
    if (attempt.status === 'failed') {
      console.warn(`[shorts] ${attempt.platform} en échec : ${attempt.error ?? '?'}`);
      return;
    }
    const step = STEP_OF[attempt.platform];
    if (!step || attempt.status !== 'published') return;
    const draft = this.postDrafts.findById(draftId);
    if (!draft || draft.steps.includes(step)) return;
    this.postDrafts.update(draftId, { steps: [...draft.steps, step] });
  }
}
