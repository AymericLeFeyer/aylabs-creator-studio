import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ChannelRepository } from '../../../domain/channel/repositories/ChannelRepository.ts';
import type { InstagramAccountRepository } from '../../../domain/instagram/repositories/InstagramRepository.ts';
import type {
  PublishAttempt,
  PublishPlatform,
  PublishTarget,
  PublishTargets,
  PublishUpload,
} from '../../../domain/publish/entities/Publish.ts';
import type { PublishRepository } from '../../../domain/publish/repositories/PublishRepository.ts';
import type { PublishStaging } from '../../../domain/publish/repositories/PublishStaging.ts';
import type { TikTokPublishAccess } from '../../../domain/publish/repositories/TikTokPublishAccess.ts';
import {
  captionWithHashtags,
  type ShortOptions,
} from '../../../domain/postDraft/entities/PostDraft.ts';
import { fitTags } from '../../../domain/production/services/scriptText.ts';
import { TikTokApiClient } from '../../../infrastructure/tiktok/api/TikTokApiClient.ts';
import { InstagramClient } from '../../../infrastructure/instagram/api/InstagramClient.ts';
import { YouTubeUploadClient } from '../../../infrastructure/youtube/api/YouTubeUploadClient.ts';
import { AppError, badRequest, notFound } from '../../../shared/errors.ts';
import { newId } from '../../../shared/id.ts';

export interface PublishConfig {
  /** Dossier des vidéos, à côté de la base (donc dans le volume). */
  storageDir: string;
  gcpClientId: string | null;
  gcpClientSecret: string | null;
}

/** 2 Go : bien au-delà de ce que pèse un short. */
export const MAX_UPLOAD_BYTES = 2 * 1024 ** 3;

/** Un Reel se traite en quelques dizaines de secondes ; au-delà de 10 min, on abandonne. */
const IG_POLL_INTERVAL_MS = 5_000;
const IG_POLL_MAX_MS = 10 * 60_000;

/** TikTok traite une vidéo en quelques dizaines de secondes, comme Meta. */
const TIKTOK_POLL_INTERVAL_MS = 5_000;
const TIKTOK_POLL_MAX_MS = 10 * 60_000;
/** Les seuls formats que TikTok accepte en envoi direct. */
const TIKTOK_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

/** `media_publish` échoue parfois de façon passagère : deux nouveaux essais, espacés. */
const PUBLISH_RETRIES = 2;
const PUBLISH_RETRY_DELAY_MS = 5_000;

/**
 * Les fichiers déposés pour Meta restent 24 h : Meta peut relire la vidéo jusqu'à la
 * publication. Les liens signés valent autant, le nettoyage passe toutes les heures.
 */
const STAGING_TTL_MS = 24 * 60 * 60_000;
const STAGING_LINK_SECONDS = STAGING_TTL_MS / 1000;
const STAGING_SWEEP_MS = 60 * 60_000;

const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : 'erreur inconnue';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ce qui part avec la vidéo. Chaque plateforme y prend ce qu'elle sait recevoir. */
export interface ShortContent {
  title: string;
  description: string;
  options: ShortOptions;
  /** Miniature YouTube et couverture Instagram (JPEG). */
  cover: { data: Buffer; mimeType: string } | null;
  /** La chaîne YouTube à préférer (celle de la vidéo d'origine), si elle est en OAuth. */
  preferredChannelId?: string | null;
}

/** Instagram : 3 collaborateurs au plus, sans « @ ». */
const collaboratorsOf = (raw: string): string[] =>
  raw
    .split(/[\s,;]+/)
    .map((name) => name.replace(/^@/, '').trim())
    .filter(Boolean)
    .slice(0, 3);

/**
 * La mise en ligne directe d'une vidéo sur YouTube, Instagram et TikTok, menée **en
 * arrière-plan** par le serveur (un envoi de 500 Mo dépasse le délai de nginx) ; l'état de
 * chaque envoi vit en base (`publish_attempts`).
 *
 * Il ne crée aucune configuration : il reprend les chaînes OAuth (Paramètres → YouTube), les
 * comptes Instagram à jeton (Paramètres → Instagram) et les connexions TikTok. Il ne décide
 * pas **quand** publier : c'est `ManageShorts` qui l'appelle, à l'heure ou sur « Publier
 * maintenant ».
 *
 * - **YouTube** : la vidéo est poussée par le serveur, en **public** (un projet GCP non
 *   audité la force en privé, c'est YouTube qui tranche) ;
 * - **Instagram** : Meta ne sait que télécharger la vidéo, d'où le dépôt au stockage S3
 *   éphémère **au moment de publier**, conteneur `REELS`, puis publication ;
 * - **TikTok** : poussée par le serveur, en **brouillon** dans la boîte de réception de
 *   l'app (l'app n'est pas auditée) : on finit et on publie depuis le téléphone.
 */
export class ManagePublishing {
  private readonly repository: PublishRepository;
  private readonly channels: ChannelRepository;
  private readonly instagramAccounts: InstagramAccountRepository;
  private readonly tiktok: TikTokPublishAccess;
  private readonly config: PublishConfig;
  private readonly staging: PublishStaging;

  constructor(
    repository: PublishRepository,
    channels: ChannelRepository,
    instagramAccounts: InstagramAccountRepository,
    tiktok: TikTokPublishAccess,
    staging: PublishStaging,
    config: PublishConfig,
  ) {
    this.repository = repository;
    this.channels = channels;
    this.instagramAccounts = instagramAccounts;
    this.tiktok = tiktok;
    this.staging = staging;
    this.config = config;
    mkdirSync(config.storageDir, { recursive: true });
    // Les envois vivent en mémoire : un redémarrage les a coupés net.
    repository.failInterrupted('Interrompu par un redémarrage du serveur');
    if (staging.configured) {
      const sweep = () => void staging.removeOlderThan('publish/', STAGING_TTL_MS);
      sweep();
      setInterval(sweep, STAGING_SWEEP_MS).unref();
    }
  }

  private youtubeTargets(): PublishTarget[] {
    return this.channels
      .findAll()
      .filter((channel) => channel.mode === 'oauth' && channel.refreshToken)
      .map((channel) => ({ id: channel.id, name: channel.name, color: channel.color }));
  }

  private instagramTargets(): PublishTarget[] {
    return this.instagramAccounts
      .findAll()
      .filter((account) => account.hasToken && !account.isArchived)
      .map((account) => ({ id: account.id, name: `@${account.username}`, color: account.color }));
  }

  targets(): PublishTargets {
    return {
      youtube: this.youtubeTargets(),
      instagram: this.instagramTargets(),
      stagingConfigured: this.staging.configured,
      tiktok: { configured: this.tiktok.configured, accounts: this.tiktok.targets() },
    };
  }

  findUpload(id: string): PublishUpload | null {
    return this.repository.findUpload(id);
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

  /** Efface la vidéo (fichier et ligne ; ses envois partent en cascade). */
  deleteUpload(id: string): void {
    const upload = this.repository.findUpload(id);
    if (!upload) return;
    rmSync(this.filePath(upload), { force: true });
    this.repository.deleteUpload(id);
  }

  /**
   * Au démarrage : efface les dépôts qu'aucune publication ne porte plus (ceux de l'ancien
   * banc d'essai Publish, un envoi coupé avant d'être rattaché) et les fichiers orphelins.
   */
  prune(keep: Set<string>): void {
    for (const upload of this.repository.listUploads()) {
      if (!keep.has(upload.id)) this.deleteUpload(upload.id);
    }
    const known = new Set(this.repository.listUploads().map((upload) => this.filePath(upload)));
    for (const name of readdirSync(this.config.storageDir)) {
      const path = join(this.config.storageDir, name);
      if (!known.has(path)) rmSync(path, { force: true });
    }
  }

  /**
   * Lance la mise en ligne sur une plateforme. Rend l'envoi créé **et** la promesse de sa
   * fin, qui ne rejette jamais : l'échec est écrit dans l'envoi (`failed`, `error`). Une
   * cible introuvable (aucun compte connecté) donne aussi un envoi en échec, visible à
   * l'écran plutôt qu'un silence.
   */
  publish(
    platform: PublishPlatform,
    uploadId: string,
    content: ShortContent,
  ): { attempt: PublishAttempt; done: Promise<PublishAttempt> } {
    const upload = this.repository.findUpload(uploadId);
    if (!upload) throw notFound('Vidéo');
    const target = this.targetFor(platform, content.preferredChannelId ?? null);
    const attempt = this.repository.createAttempt({
      uploadId,
      platform,
      targetId: target?.id ?? '',
      targetName: target?.name ?? '—',
      status: target ? 'uploading' : 'failed',
      privacy:
        platform === 'youtube'
          ? content.options.youtube.visibility
          : platform === 'tiktok'
            ? 'draft'
            : content.options.instagram.trial
              ? 'trial'
              : null,
      title: (platform === 'youtube' ? content.title : content.description || content.title)
        .split('\n')[0]!
        .slice(0, 100),
    });
    if (!target) {
      const failed = this.repository.updateAttempt(attempt.id, {
        error: NO_TARGET[platform],
      });
      return { attempt: failed, done: Promise.resolve(failed) };
    }

    const run =
      platform === 'youtube'
        ? this.runYouTube(attempt, upload, target.id, content)
        : platform === 'instagram'
          ? this.runInstagram(attempt, upload, target.id, content)
          : this.runTikTok(attempt, upload, target.id);
    const done = run
      .catch((error: unknown) => {
        this.repository.updateAttempt(attempt.id, { status: 'failed', error: messageOf(error) });
      })
      .then(() => this.repository.findAttempt(attempt.id)!);
    return { attempt, done };
  }

  /** La cible par défaut : la chaîne de la vidéo d'origine si possible, sinon la première. */
  private targetFor(platform: PublishPlatform, preferredChannelId: string | null) {
    if (platform === 'youtube') {
      const targets = this.youtubeTargets();
      return targets.find((target) => target.id === preferredChannelId) ?? targets[0] ?? null;
    }
    if (platform === 'instagram') return this.instagramTargets()[0] ?? null;
    return this.tiktok.configured ? (this.tiktok.targets()[0] ?? null) : null;
  }

  // --- YouTube ------------------------------------------------------------------

  private youtubeClient(channelId: string): YouTubeUploadClient {
    const channel = this.channels.findById(channelId);
    if (!channel?.refreshToken) throw badRequest('Cette chaîne n’a plus de refresh token');
    if (!this.config.gcpClientId || !this.config.gcpClientSecret) {
      throw badRequest('GCP_CLIENT_ID / GCP_CLIENT_SECRET absents de la configuration');
    }
    return new YouTubeUploadClient({
      clientId: this.config.gcpClientId,
      clientSecret: this.config.gcpClientSecret,
      refreshToken: channel.refreshToken,
    });
  }

  private async runYouTube(
    attempt: PublishAttempt,
    upload: PublishUpload,
    channelId: string,
    content: ShortContent,
  ): Promise<void> {
    const client = this.youtubeClient(channelId);
    const youtube = content.options.youtube;
    const { videoId } = await client.upload({
      filePath: this.filePath(upload),
      mimeType: upload.mimeType,
      title: content.title.slice(0, 100),
      description: captionWithHashtags(content.description, content.options.hashtags).slice(
        0,
        5000,
      ),
      tags: fitTags(youtube.tags.split(',')),
      privacy: youtube.visibility,
      categoryId: youtube.categoryId,
      madeForKids: youtube.madeForKids,
      notifySubscribers: youtube.notifySubscribers,
    });
    this.repository.updateAttempt(attempt.id, {
      status: 'published',
      externalId: videoId,
      url: `https://youtube.com/shorts/${videoId}`,
    });
    if (!content.cover) return;
    // La vidéo est en ligne : une miniature refusée (chaîne non vérifiée, image trop lourde)
    // ne la fait pas échouer, elle est seulement signalée.
    try {
      await client.setThumbnail(videoId, content.cover);
      this.repository.updateAttempt(attempt.id, { thumbnailSetAt: new Date().toISOString() });
    } catch (error) {
      this.repository.updateAttempt(attempt.id, {
        error: `Vidéo en ligne, miniature refusée : ${messageOf(error)}`,
      });
    }
  }

  // --- Instagram -----------------------------------------------------------------

  /**
   * Dépose la vidéo au stockage éphémère (c'est **maintenant**, à l'heure de publier, qu'elle
   * y part), crée le conteneur du Reel à partir du lien signé, attend qu'il soit prêt, puis
   * le publie. Le fichier déposé reste 24 h : Meta peut le relire jusqu'à la publication.
   */
  private async runInstagram(
    attempt: PublishAttempt,
    upload: PublishUpload,
    accountId: string,
    content: ShortContent,
  ): Promise<void> {
    const account = this.instagramAccounts.findById(accountId);
    if (!account?.accessToken) throw badRequest('Ce compte Instagram n’a plus de jeton');
    if (!this.staging.configured) {
      throw badRequest(
        'Stockage de publication absent (PUBLISH_S3_*) : Meta télécharge la vidéo à une adresse publique.',
      );
    }
    const client = new InstagramClient(account.accessToken);
    const fileName = this.filePath(upload).split(/[\\/]/).pop() ?? upload.id;
    const videoKey = `publish/${attempt.id}/${fileName}`;
    const coverKey = `publish/${attempt.id}/cover.jpg`;
    await this.staging.put(
      videoKey,
      createReadStream(this.filePath(upload)),
      upload.sizeBytes,
      upload.mimeType,
    );
    const instagram = content.options.instagram;
    // Couverture : l'image si elle est en JPEG (seul format admis), sinon l'instant choisi.
    const cover = content.cover?.mimeType === 'image/jpeg' ? content.cover : null;
    if (cover) await this.staging.put(coverKey, cover.data, cover.data.length, cover.mimeType);

    const containerId = await client.createReelContainer(account.igUserId, {
      videoUrl: await this.staging.signedUrl(videoKey, STAGING_LINK_SECONDS),
      coverUrl: cover ? await this.staging.signedUrl(coverKey, STAGING_LINK_SECONDS) : undefined,
      coverOffsetMs:
        instagram.coverAtSeconds === null ? undefined : Math.round(instagram.coverAtSeconds * 1000),
      caption: captionWithHashtags(
        content.description || content.title,
        content.options.hashtags,
      ).slice(0, 2200),
      shareToFeed: instagram.shareToFeed,
      trial: instagram.trial,
      collaborators: collaboratorsOf(instagram.collaborators),
    });
    this.repository.updateAttempt(attempt.id, { status: 'processing', externalId: containerId });

    const deadline = Date.now() + IG_POLL_MAX_MS;
    for (;;) {
      if (Date.now() > deadline)
        throw new Error('Meta n’a pas fini de traiter la vidéo en 10 minutes');
      await sleep(IG_POLL_INTERVAL_MS);
      const { statusCode, status } = await client.containerStatus(containerId);
      if (statusCode === 'FINISHED') break;
      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        throw new Error(`Meta a refusé la vidéo (${statusCode}${status ? ` : ${status}` : ''})`);
      }
    }
    this.repository.updateAttempt(attempt.id, { status: 'publishing' });

    // `media_publish` répond parfois « An unexpected error has occurred » alors que le Reel
    // est publié, ou parce que le conteneur à peine prêt ne l'est pas encore : après chaque
    // erreur, on relit l'état du conteneur (`PUBLISHED` vaut succès), sinon on réessaie.
    for (let round = 0; ; round += 1) {
      try {
        const mediaId = await client.publishContainer(account.igUserId, containerId);
        const permalink = await client.mediaPermalink(mediaId).catch(() => null);
        this.repository.updateAttempt(attempt.id, {
          status: 'published',
          externalId: mediaId,
          url: permalink,
          error: null,
        });
        return;
      } catch (error) {
        const state = await client.containerStatus(containerId).catch(() => null);
        if (state?.statusCode === 'PUBLISHED') {
          const [latest] = await client.fetchMedia(account.igUserId, 1).catch(() => []);
          this.repository.updateAttempt(attempt.id, {
            status: 'published',
            externalId: latest?.id ?? containerId,
            url: latest?.permalink ?? null,
            error: null,
          });
          return;
        }
        if (round >= PUBLISH_RETRIES || state?.statusCode === 'EXPIRED') {
          throw new Error(
            `${messageOf(error)}${state ? ` (conteneur : ${state.statusCode})` : ''}`,
            { cause: error },
          );
        }
        await sleep(PUBLISH_RETRY_DELAY_MS * (round + 1));
      }
    }
  }

  // --- TikTok --------------------------------------------------------------------

  /**
   * Envoie la vidéo dans la boîte de réception de l'app TikTok (`video.upload`), **poussée
   * par le serveur** morceau par morceau : ni stockage éphémère, ni adresse publique. On
   * finit (légende, son, visibilité) et on publie depuis le téléphone. → `ready`.
   */
  private async runTikTok(
    attempt: PublishAttempt,
    upload: PublishUpload,
    connectionId: string,
  ): Promise<void> {
    if (!TIKTOK_TYPES.includes(upload.mimeType)) {
      throw badRequest('TikTok n’accepte que le MP4, le MOV et le WebM');
    }
    const session = await this.tiktok.session(connectionId);
    const client = new TikTokApiClient(session.accessToken);
    const { publishId, uploadUrl } = await client.initInboxUpload(upload.sizeBytes);
    this.repository.updateAttempt(attempt.id, { externalId: publishId });
    await TikTokApiClient.uploadFile(
      uploadUrl,
      this.filePath(upload),
      upload.sizeBytes,
      upload.mimeType,
    );
    this.repository.updateAttempt(attempt.id, { status: 'processing' });

    const deadline = Date.now() + TIKTOK_POLL_MAX_MS;
    let last = '';
    while (Date.now() < deadline) {
      await sleep(TIKTOK_POLL_INTERVAL_MS);
      const state = await client.status(publishId);
      if (state.status !== last) {
        // L'état TikTok tel quel, dans les journaux du conteneur : c'est lui qui dit où un
        // envoi resté « en traitement » s'est arrêté.
        console.log(`[publish] TikTok ${publishId} : ${state.status}`);
        last = state.status;
      }
      if (state.status === 'SEND_TO_USER_INBOX' || state.status === 'PUBLISH_COMPLETE') {
        this.repository.updateAttempt(attempt.id, {
          status: 'ready',
          url: session.username ? `https://www.tiktok.com/@${session.username}` : null,
        });
        return;
      }
      if (state.status === 'FAILED') {
        throw new Error(`TikTok a refusé la vidéo (${state.failReason ?? 'raison inconnue'})`);
      }
    }
    throw new Error(
      `TikTok n’a pas fini de traiter la vidéo en 10 minutes (dernier état : ${last || 'aucun'})`,
    );
  }
}

const NO_TARGET: Record<PublishPlatform, string> = {
  youtube: 'Aucune chaîne YouTube en OAuth (Paramètres → YouTube)',
  instagram: 'Aucun compte Instagram à jeton (Paramètres → Instagram)',
  tiktok: 'Aucun compte TikTok connecté (Paramètres → TikTok)',
};
