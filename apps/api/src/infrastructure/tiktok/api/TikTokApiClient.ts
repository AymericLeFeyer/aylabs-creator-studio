import { open } from 'node:fs/promises';
import { upstream } from '../../../shared/errors.ts';

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const API = 'https://open.tiktokapis.com/v2';
const TIMEOUT_MS = 60_000;

export interface TikTokOAuthConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TikTokTokens {
  accessToken: string;
  refreshToken: string;
  openId: string;
  scopes: string[];
  /** Secondes. */
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface TikTokCreatorInfo {
  username: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  privacyLevelOptions: string[];
  maxDurationSec: number | null;
}

export interface TikTokPostStatus {
  status: string;
  failReason: string | null;
  postIds: string[];
}

/** Ce qu'une publication directe envoie (`post_info`). */
export interface TikTokDirectPostInfo {
  title: string;
  privacyLevel: string;
  coverTimestampMs?: number;
}

/** Les codes d'erreur qu'on traduit, le reste passe tel quel. */
const KNOWN_ERRORS: Record<string, string> = {
  unaudited_client_can_only_post_to_private_accounts:
    'App TikTok non auditée : la publication directe ne marche que sur un compte privé. ' +
    'Passe le compte en privé le temps du test, ou envoie en brouillon.',
  scope_not_authorized:
    'Scope manquant : vérifie que la connexion a accordé video.upload / video.publish (reconnecte le compte).',
  access_token_invalid: 'Jeton TikTok refusé : reconnecte le compte.',
  spam_risk_too_many_pending_share:
    'TikTok limite à 5 brouillons en attente par 24 h : publie ou supprime ceux de ta boîte.',
  spam_risk_too_many_posts:
    'TikTok limite le nombre de publications par jour : réessaie plus tard.',
  privacy_level_option_mismatch: 'Niveau de visibilité refusé par TikTok pour ce compte.',
  reached_active_user_cap: 'Quota d’utilisateurs de l’app TikTok atteint.',
  rate_limit_exceeded: 'Trop de requêtes TikTok : réessaie dans une minute.',
};

interface ApiEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string; log_id?: string; logid?: string };
}

const fetchWithTimeout = (url: string, init: RequestInit): Promise<Response> =>
  fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });

const readTokens = async (response: Response): Promise<TikTokTokens> => {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== 'string') {
    const reason =
      (body.error_description as string | undefined) ??
      (body.error as string | undefined) ??
      `HTTP ${response.status}`;
    throw upstream(`TikTok a refusé le jeton : ${reason}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: String(body.refresh_token ?? ''),
    openId: String(body.open_id ?? ''),
    scopes: String(body.scope ?? '')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean),
    expiresIn: Number(body.expires_in ?? 3600),
    refreshExpiresIn: Number(body.refresh_expires_in ?? 180 * 86_400),
  };
};

/**
 * Le client TikTok : OAuth (Login Kit) et Content Posting API. `fetch` nu, sans SDK — TikTok
 * n'en publie pas pour Node, et le besoin tient en six appels.
 */
export class TikTokApiClient {
  private readonly accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  // --- OAuth ------------------------------------------------------------------------

  static authorizeUrl(config: TikTokOAuthConfig, scopes: string[], state: string): string {
    const params = new URLSearchParams({
      client_key: config.clientKey,
      response_type: 'code',
      scope: scopes.join(','),
      redirect_uri: config.redirectUri,
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  static async exchangeCode(config: TikTokOAuthConfig, code: string): Promise<TikTokTokens> {
    const response = await fetchWithTimeout(`${API}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUri,
      }),
    });
    return readTokens(response);
  }

  static async refresh(config: TikTokOAuthConfig, refreshToken: string): Promise<TikTokTokens> {
    const response = await fetchWithTimeout(`${API}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    return readTokens(response);
  }

  // --- Appels authentifiés ---------------------------------------------------------

  private async call<T>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown },
  ): Promise<T> {
    const response = await fetchWithTimeout(`${API}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    // Les identifiants de publication sont des int64 : sans guillemets, `JSON.parse` les
    // arrondirait et le lien vers la vidéo serait faux.
    const text = (await response.text().catch(() => '')).replace(
      /([:[,]\s*)(\d{16,})(?=\s*[,\]}])/g,
      '$1"$2"',
    );
    let envelope: ApiEnvelope<T> = {};
    try {
      envelope = JSON.parse(text) as ApiEnvelope<T>;
    } catch {
      // Corps illisible : on retombe sur le code HTTP.
    }
    const code = envelope.error?.code;
    if (!response.ok || (code && code !== 'ok')) {
      const known = code ? KNOWN_ERRORS[code] : undefined;
      throw upstream(
        known ??
          `TikTok : ${envelope.error?.message || `HTTP ${response.status}`}${code ? ` (${code})` : ''}`,
      );
    }
    return (envelope.data ?? {}) as T;
  }

  /** Le profil de base (`user.info.basic`) : nom affiché et avatar. */
  async userInfo(): Promise<{ displayName: string | null; avatarUrl: string | null }> {
    const data = await this.call<{
      user?: { display_name?: string; avatar_url?: string };
    }>('/user/info/?fields=open_id,display_name,avatar_url', { method: 'GET' });
    return {
      displayName: data.user?.display_name ?? null,
      avatarUrl: data.user?.avatar_url ?? null,
    };
  }

  /** Obligatoire avant une publication directe (scope `video.publish`). */
  async creatorInfo(): Promise<TikTokCreatorInfo> {
    const data = await this.call<{
      creator_username?: string;
      creator_nickname?: string;
      creator_avatar_url?: string;
      privacy_level_options?: string[];
      max_video_post_duration_sec?: number;
    }>('/post/publish/creator_info/query/', { method: 'POST', body: {} });
    return {
      username: data.creator_username ?? null,
      nickname: data.creator_nickname ?? null,
      avatarUrl: data.creator_avatar_url ?? null,
      privacyLevelOptions: data.privacy_level_options ?? [],
      maxDurationSec: data.max_video_post_duration_sec ?? null,
    };
  }

  /**
   * Le découpage exigé par TikTok : un seul morceau jusqu'à 64 Mo, sinon des morceaux de
   * 10 Mo, le dernier absorbant le reste (128 Mo max, 1 000 morceaux max).
   */
  static chunking(size: number): { chunkSize: number; count: number } {
    const single = 64 * 1024 ** 2;
    if (size <= single) return { chunkSize: size, count: 1 };
    const chunkSize = 10 * 1024 ** 2;
    return { chunkSize, count: Math.floor(size / chunkSize) };
  }

  private sourceInfo(size: number) {
    const { chunkSize, count } = TikTokApiClient.chunking(size);
    return {
      source: 'FILE_UPLOAD',
      video_size: size,
      chunk_size: chunkSize,
      total_chunk_count: count,
    };
  }

  /** Brouillon dans la boîte de réception de l'app (`video.upload`). */
  async initInboxUpload(size: number): Promise<{ publishId: string; uploadUrl: string }> {
    const data = await this.call<{ publish_id: string; upload_url: string }>(
      '/post/publish/inbox/video/init/',
      { method: 'POST', body: { source_info: this.sourceInfo(size) } },
    );
    return { publishId: data.publish_id, uploadUrl: data.upload_url };
  }

  /** Publication directe (`video.publish`). */
  async initDirectPost(
    size: number,
    info: TikTokDirectPostInfo,
  ): Promise<{ publishId: string; uploadUrl: string }> {
    const data = await this.call<{ publish_id: string; upload_url: string }>(
      '/post/publish/video/init/',
      {
        method: 'POST',
        body: {
          post_info: {
            title: info.title,
            privacy_level: info.privacyLevel,
            disable_duet: false,
            disable_stitch: false,
            disable_comment: false,
            brand_content_toggle: false,
            brand_organic_toggle: false,
            ...(info.coverTimestampMs !== undefined
              ? { video_cover_timestamp_ms: info.coverTimestampMs }
              : {}),
          },
          source_info: this.sourceInfo(size),
        },
      },
    );
    return { publishId: data.publish_id, uploadUrl: data.upload_url };
  }

  /** Envoie le fichier, morceau par morceau et **dans l'ordre**, comme TikTok l'exige. */
  static async uploadFile(
    uploadUrl: string,
    filePath: string,
    size: number,
    mimeType: string,
  ): Promise<void> {
    const { chunkSize, count } = TikTokApiClient.chunking(size);
    const file = await open(filePath, 'r');
    try {
      for (let index = 0; index < count; index += 1) {
        const start = index * chunkSize;
        const end = index === count - 1 ? size - 1 : start + chunkSize - 1;
        const buffer = Buffer.alloc(end - start + 1);
        await file.read(buffer, 0, buffer.length, start);
        const response = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': mimeType,
            'Content-Length': String(buffer.length),
            'Content-Range': `bytes ${start}-${end}/${size}`,
          },
          body: buffer,
          signal: AbortSignal.timeout(5 * 60_000),
        });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw upstream(
            `TikTok a refusé le morceau ${index + 1}/${count} (HTTP ${response.status}) ${text.slice(0, 200)}`,
          );
        }
      }
    } finally {
      await file.close();
    }
  }

  async status(publishId: string): Promise<TikTokPostStatus> {
    const data = await this.call<{
      status?: string;
      fail_reason?: string;
      publicaly_available_post_id?: (string | number)[];
    }>('/post/publish/status/fetch/', { method: 'POST', body: { publish_id: publishId } });
    return {
      status: data.status ?? 'UNKNOWN',
      failReason: data.fail_reason ?? null,
      postIds: (data.publicaly_available_post_id ?? []).map(String),
    };
  }
}
