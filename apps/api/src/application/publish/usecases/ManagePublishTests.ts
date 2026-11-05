import { randomBytes } from 'node:crypto';
import { createWriteStream, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ChannelRepository } from '../../../domain/channel/repositories/ChannelRepository.ts';
import type { InstagramAccountRepository } from '../../../domain/instagram/repositories/InstagramRepository.ts';
import type { ThumbnailImage } from '../../../domain/thumbnail/entities/Thumbnail.ts';
import { imageMimeType } from '../../../domain/thumbnail/services/imageType.ts';
import type {
  PublishAttempt,
  PublishTargets,
  PublishUpload,
  PublishUploadView,
  YouTubePrivacy,
  YouTubeThumbnailSource,
} from '../../../domain/publish/entities/Publish.ts';
import type { PublishRepository } from '../../../domain/publish/repositories/PublishRepository.ts';
import { InstagramClient } from '../../../infrastructure/instagram/api/InstagramClient.ts';
import { YouTubeUploadClient } from '../../../infrastructure/youtube/api/YouTubeUploadClient.ts';
import { AppError, badRequest, conflict, notFound } from '../../../shared/errors.ts';
import { newId } from '../../../shared/id.ts';

export interface PublishConfig {
  /** Dossier des vidéos, à côté de la base (donc dans le volume). */
  storageDir: string;
  gcpClientId: string | null;
  gcpClientSecret: string | null;
}

/** 2 Go : au-delà, ce n'est plus un essai. */
export const MAX_UPLOAD_BYTES = 2 * 1024 ** 3;

/** Un Reel se traite en quelques dizaines de secondes ; au-delà de 10 min, on abandonne. */
const IG_POLL_INTERVAL_MS = 5_000;
const IG_POLL_MAX_MS = 10 * 60_000;

const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : 'erreur inconnue';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface StartYouTubeInput {
  channelId: string;
  title: string;
  description: string;
  tags: string[];
  privacy: YouTubePrivacy;
  thumbnail?: YouTubeThumbnailSource;
}

export interface PrepareInstagramInput {
  accountId: string;
  caption: string;
  shareToFeed: boolean;
  /**
   * L'image de couverture, **prise dans la vidéo** (millisecondes). Instagram n'accepte une
   * image à part que par adresse publique (`cover_url`), que le studio n'a pas.
   */
  coverOffsetMs?: number;
}

/** Une miniature générée (Production → Miniatures), lue par son identifiant. */
export type ThumbnailImageReader = (id: string) => ThumbnailImage;

/** YouTube : JPEG ou PNG, 2 Mo maximum. */
const MAX_THUMBNAIL_BYTES = 2 * 1024 ** 2;

/**
 * Production → Publish : le banc d'essai, **temporaire**, de la publication directe.
 *
 * Il ne crée aucune configuration : il reprend les chaînes OAuth (Paramètres → YouTube) et
 * les comptes Instagram à jeton (Paramètres → Instagram). Les envois tournent **en
 * arrière-plan** (un envoi YouTube de 500 Mo dépasse le délai de nginx) et leur état vit en
 * base : l'écran relit la liste tant qu'un envoi est en cours.
 *
 * Rien ne part sans un clic : chaque plateforme a son bouton, et Instagram, qui ne sait pas
 * publier en privé, s'arrête au conteneur prêt tant qu'on n'a pas cliqué « Publier ».
 */
export class ManagePublishTests {
  private readonly repository: PublishRepository;
  private readonly channels: ChannelRepository;
  private readonly instagramAccounts: InstagramAccountRepository;
  private readonly config: PublishConfig;
  private readonly thumbnailImage: ThumbnailImageReader;

  constructor(
    repository: PublishRepository,
    channels: ChannelRepository,
    instagramAccounts: InstagramAccountRepository,
    thumbnailImage: ThumbnailImageReader,
    config: PublishConfig,
  ) {
    this.repository = repository;
    this.channels = channels;
    this.instagramAccounts = instagramAccounts;
    this.thumbnailImage = thumbnailImage;
    this.config = config;
    mkdirSync(config.storageDir, { recursive: true });
    // Les envois vivent en mémoire : un redémarrage les a coupés net.
    repository.failInterrupted('Interrompu par un redémarrage du serveur');
  }

  targets(): PublishTargets {
    return {
      youtube: this.channels
        .findAll()
        .filter((channel) => channel.mode === 'oauth' && channel.refreshToken)
        .map((channel) => ({ id: channel.id, name: channel.name, color: channel.color })),
      instagram: this.instagramAccounts
        .findAll()
        .filter((account) => account.hasToken)
        .map((account) => ({
          id: account.id,
          name: `@${account.username}`,
          color: account.color,
        })),
      tiktok: {
        available: false,
        reason:
          'Aucune connexion TikTok : il faut une app développeur TikTok, son OAuth et le ' +
          'scope video.upload (la vidéo arrive en brouillon dans la boîte de réception).',
      },
    };
  }

  list(): PublishUploadView[] {
    return this.repository.listUploads();
  }

  /** Le fichier sur le disque. */
  private filePath(upload: Pick<PublishUpload, 'id' | 'mimeType'>): string {
    return join(this.config.storageDir, `${upload.id}.${EXTENSIONS[upload.mimeType] ?? 'bin'}`);
  }

  fileByToken(token: string): { upload: PublishUpload; path: string } {
    const upload = this.repository.findUploadByToken(token);
    if (!upload) throw notFound('Vidéo');
    return { upload, path: this.filePath(upload) };
  }

  /** Écrit le corps de la requête sur le disque, en flux : rien n'est gardé en mémoire. */
  async receive(body: Readable, fileName: string, mimeType: string): Promise<PublishUpload> {
    if (!mimeType.startsWith('video/')) throw badRequest('Ce fichier n’est pas une vidéo');
    const id = newId();
    const path = this.filePath({ id, mimeType });

    let size = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (size > MAX_UPLOAD_BYTES) callback(badRequest('Vidéo trop lourde (2 Go maximum)'));
        else callback(null, chunk);
      },
    });

    try {
      await pipeline(body, counter, createWriteStream(path));
    } catch (error) {
      rmSync(path, { force: true });
      if (error instanceof AppError) throw error;
      throw badRequest(`Envoi interrompu : ${messageOf(error)}`);
    }
    if (size === 0) {
      rmSync(path, { force: true });
      throw badRequest('Fichier vide');
    }
    return this.repository.createUpload({
      id,
      fileName: fileName.slice(0, 200) || 'video',
      mimeType,
      sizeBytes: size,
      publicToken: randomBytes(24).toString('base64url'),
    });
  }

  delete(id: string): void {
    const upload = this.repository.findUpload(id);
    if (!upload) throw notFound('Vidéo');
    rmSync(this.filePath(upload), { force: true });
    this.repository.deleteUpload(id);
  }

  // --- YouTube ------------------------------------------------------------------

  /** Lit et vérifie la miniature **avant** tout envoi : une image refusée ne coûte rien. */
  private resolveThumbnail(source: YouTubeThumbnailSource): ThumbnailImage {
    const data =
      'thumbnailId' in source
        ? this.thumbnailImage(source.thumbnailId).data
        : Buffer.from(source.image.replace(/^data:[^,]*,/, ''), 'base64');
    const mimeType = imageMimeType(data);
    if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
      throw badRequest('Miniature YouTube : JPEG ou PNG attendu');
    }
    if (data.length > MAX_THUMBNAIL_BYTES) throw badRequest('Miniature YouTube : 2 Mo maximum');
    return { data, mimeType };
  }

  private youtubeClient(channelId: string): { client: YouTubeUploadClient; name: string } {
    const channel = this.channels.findById(channelId);
    if (!channel) throw notFound('Chaîne');
    if (channel.mode !== 'oauth' || !channel.refreshToken) {
      throw badRequest('Cette chaîne n’a pas de refresh token OAuth (Paramètres → YouTube)');
    }
    if (!this.config.gcpClientId || !this.config.gcpClientSecret) {
      throw badRequest('GCP_CLIENT_ID / GCP_CLIENT_SECRET absents de la configuration');
    }
    return {
      name: channel.name,
      client: new YouTubeUploadClient({
        clientId: this.config.gcpClientId,
        clientSecret: this.config.gcpClientSecret,
        refreshToken: channel.refreshToken,
      }),
    };
  }

  /** Pose (ou remplace) la miniature d'une vidéo déjà envoyée. */
  async setYouTubeThumbnail(
    attemptId: string,
    source: YouTubeThumbnailSource,
  ): Promise<PublishAttempt> {
    const attempt = this.repository.findAttempt(attemptId);
    if (!attempt || attempt.platform !== 'youtube') throw notFound('Envoi YouTube');
    if (attempt.status !== 'published' || !attempt.externalId) {
      throw conflict('La vidéo n’est pas encore sur YouTube');
    }
    const image = this.resolveThumbnail(source);
    const { client } = this.youtubeClient(attempt.targetId);
    await client.setThumbnail(attempt.externalId, image);
    return this.repository.updateAttempt(attemptId, {
      thumbnailSetAt: new Date().toISOString(),
      error: null,
    });
  }

  startYouTube(uploadId: string, input: StartYouTubeInput): PublishAttempt {
    const upload = this.repository.findUpload(uploadId);
    if (!upload) throw notFound('Vidéo');
    const { client, name } = this.youtubeClient(input.channelId);
    const thumbnail = input.thumbnail ? this.resolveThumbnail(input.thumbnail) : null;

    const attempt = this.repository.createAttempt({
      uploadId,
      platform: 'youtube',
      targetId: input.channelId,
      targetName: name,
      status: 'uploading',
      privacy: input.privacy,
      title: input.title,
    });

    void (async () => {
      const { videoId } = await client.upload({
        filePath: this.filePath(upload),
        mimeType: upload.mimeType,
        title: input.title,
        description: input.description,
        tags: input.tags,
        privacy: input.privacy,
      });
      this.repository.updateAttempt(attempt.id, {
        status: 'published',
        externalId: videoId,
        url: `https://studio.youtube.com/video/${videoId}/edit`,
      });
      if (!thumbnail) return;
      // La vidéo est en ligne : une miniature refusée ne la fait pas échouer, elle se
      // repose depuis l'écran.
      try {
        await client.setThumbnail(videoId, thumbnail);
        this.repository.updateAttempt(attempt.id, { thumbnailSetAt: new Date().toISOString() });
      } catch (error) {
        this.repository.updateAttempt(attempt.id, { error: messageOf(error) });
      }
    })().catch((error: unknown) => {
      this.repository.updateAttempt(attempt.id, { status: 'failed', error: messageOf(error) });
    });

    return attempt;
  }

  // --- Instagram -----------------------------------------------------------------

  /**
   * Crée le conteneur du Reel et attend qu'il soit prêt. **Rien n'est publié** : c'est
   * `publishInstagram`, sur un second clic, qui rend la vidéo visible.
   */
  prepareInstagram(uploadId: string, input: PrepareInstagramInput): PublishAttempt {
    const upload = this.repository.findUpload(uploadId);
    if (!upload) throw notFound('Vidéo');
    const account = this.instagramAccounts.findById(input.accountId);
    if (!account) throw notFound('Compte Instagram');
    const token = account.accessToken;
    if (!token) throw badRequest('Ce compte n’a pas de jeton (Paramètres → Instagram)');

    const attempt = this.repository.createAttempt({
      uploadId,
      platform: 'instagram',
      targetId: account.id,
      targetName: `@${account.username}`,
      status: 'uploading',
      title: input.caption.split('\n')[0]?.slice(0, 100) ?? '',
    });

    const client = new InstagramClient(token);
    const igUserId = account.igUserId;
    const filePath = this.filePath(upload);

    void (async () => {
      const { id: containerId, uploadUri } = await client.createReelContainer(igUserId, {
        caption: input.caption,
        shareToFeed: input.shareToFeed,
        coverOffsetMs: input.coverOffsetMs,
      });
      this.repository.updateAttempt(attempt.id, { externalId: containerId });
      // Le serveur pousse la vidéo : aucune adresse publique n'est nécessaire.
      await client.uploadReelVideo(uploadUri, filePath, upload.sizeBytes);
      this.repository.updateAttempt(attempt.id, { status: 'processing', externalId: containerId });

      const deadline = Date.now() + IG_POLL_MAX_MS;
      while (Date.now() < deadline) {
        await sleep(IG_POLL_INTERVAL_MS);
        const { statusCode, status } = await client.containerStatus(containerId);
        if (statusCode === 'FINISHED') {
          this.repository.updateAttempt(attempt.id, { status: 'ready' });
          return;
        }
        if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
          throw new Error(`Meta a refusé la vidéo (${statusCode}${status ? ` : ${status}` : ''})`);
        }
      }
      throw new Error('Meta n’a pas fini de traiter la vidéo en 10 minutes');
    })().catch((error: unknown) => {
      this.repository.updateAttempt(attempt.id, { status: 'failed', error: messageOf(error) });
    });

    return attempt;
  }

  /** Publie un conteneur prêt. **Public** : Instagram n'a pas de mode privé. */
  async publishInstagram(attemptId: string): Promise<PublishAttempt> {
    const attempt = this.repository.findAttempt(attemptId);
    if (!attempt || attempt.platform !== 'instagram') throw notFound('Envoi Instagram');
    if (attempt.status !== 'ready' || !attempt.externalId) {
      throw conflict('Le conteneur n’est pas prêt (ou a déjà été publié)');
    }
    const account = this.instagramAccounts.findById(attempt.targetId);
    if (!account?.accessToken) throw badRequest('Ce compte n’a plus de jeton');

    this.repository.updateAttempt(attemptId, { status: 'publishing', error: null });
    const client = new InstagramClient(account.accessToken);
    try {
      const mediaId = await client.publishContainer(account.igUserId, attempt.externalId);
      const permalink = await client.mediaPermalink(mediaId).catch(() => null);
      return this.repository.updateAttempt(attemptId, {
        status: 'published',
        externalId: mediaId,
        url: permalink,
      });
    } catch (error) {
      // Le conteneur reste valable 24 h : on le rend « prêt » pour pouvoir réessayer.
      this.repository.updateAttempt(attemptId, { status: 'ready', error: messageOf(error) });
      throw error;
    }
  }
}
