import { randomBytes } from 'node:crypto';
import type { SecretCipher } from '../../../domain/integration/repositories/IntegrationRepository.ts';
import type { PublishTarget } from '../../../domain/publish/entities/Publish.ts';
import type { TikTokPublishAccess } from '../../../domain/publish/repositories/TikTokPublishAccess.ts';
import type {
  TikTokConnection,
  TikTokConnectionView,
  TikTokOAuthStatus,
} from '../../../domain/tiktok/entities/TikTokConnection.ts';
import type { TikTokConnectionRepository } from '../../../domain/tiktok/repositories/TikTokConnectionRepository.ts';
import {
  TikTokApiClient,
  type TikTokOAuthConfig,
  type TikTokTokens,
} from '../../../infrastructure/tiktok/api/TikTokApiClient.ts';
import { badRequest, conflict, notFound } from '../../../shared/errors.ts';

export interface TikTokConnectionConfig {
  clientKey: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
}

/**
 * Ce qu'on demande : le profil de base, le brouillon dans l'app (`video.upload`) et la
 * publication directe (`video.publish`). Les deux derniers viennent du produit « Content
 * Posting API » de l'app TikTok.
 */
export const TIKTOK_SCOPES = ['user.info.basic', 'video.upload', 'video.publish'];

/** Un `state` vaut 15 minutes : le temps de se connecter, pas de le garder pour plus tard. */
const STATE_TTL_MS = 15 * 60_000;
/** On rafraîchit le jeton d'accès 5 minutes avant son échéance. */
const REFRESH_MARGIN_MS = 5 * 60_000;

const contexts = (openId: string) => ({
  access: `tiktok:access:${openId}`,
  refresh: `tiktok:refresh:${openId}`,
});

const inSeconds = (seconds: number): string => new Date(Date.now() + seconds * 1000).toISOString();

/**
 * La connexion OAuth à TikTok, pour publier depuis Production → Publish. **Seul endroit où
 * les jetons sont déchiffrés.**
 *
 * Le studio n'est joignable que par son propriétaire : TikTok ne l'appelle jamais. Le retour
 * d'OAuth passe par le navigateur, qui arrive sur `/api/tiktok/oauth/callback` ; si cette
 * adresse n'est pas joignable (adresse de retour déclarée ailleurs), on colle l'adresse de la
 * barre d'adresse dans l'écran (`completeFromUrl`), et le résultat est le même.
 */
export class ManageTikTokConnection implements TikTokPublishAccess {
  private readonly repository: TikTokConnectionRepository;
  private readonly cipher: SecretCipher;
  private readonly config: TikTokConnectionConfig;
  /** `state` → échéance. En mémoire : un redémarrage oblige à recliquer « Connecter ». */
  private readonly states = new Map<string, number>();

  constructor(
    repository: TikTokConnectionRepository,
    cipher: SecretCipher,
    config: TikTokConnectionConfig,
  ) {
    this.repository = repository;
    this.cipher = cipher;
    this.config = config;
  }

  get configured(): boolean {
    return Boolean(this.config.clientKey && this.config.clientSecret);
  }

  private oauth(): TikTokOAuthConfig {
    if (!this.config.clientKey || !this.config.clientSecret) {
      throw badRequest('TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET absentes de la configuration');
    }
    if (!this.config.redirectUri) {
      throw badRequest(
        'Adresse de retour inconnue : renseigne PUBLIC_URL (ou TIKTOK_REDIRECT_URI) en https',
      );
    }
    return {
      clientKey: this.config.clientKey,
      clientSecret: this.config.clientSecret,
      redirectUri: this.config.redirectUri,
    };
  }

  private toView(connection: TikTokConnection): TikTokConnectionView {
    const keys = contexts(connection.openId);
    return {
      id: connection.id,
      openId: connection.openId,
      username: connection.username,
      displayName: connection.displayName,
      avatarUrl: connection.avatarUrl,
      scopes: connection.scopes,
      refreshExpiresAt: connection.refreshExpiresAt,
      readable: this.cipher.decrypt(connection.encryptedRefreshToken, keys.refresh) !== null,
    };
  }

  status(): TikTokOAuthStatus {
    return {
      configured: this.configured,
      redirectUri: this.config.redirectUri,
      secretsKeyConfigured: this.cipher.available,
      scopes: TIKTOK_SCOPES,
      connections: this.repository.findAll().map((c) => this.toView(c)),
    };
  }

  start(): { url: string } {
    const oauth = this.oauth();
    if (!this.cipher.available) {
      throw conflict('SECRETS_KEY absente : les jetons TikTok ne peuvent pas être enregistrés');
    }
    const now = Date.now();
    for (const [state, expiresAt] of this.states) if (expiresAt < now) this.states.delete(state);
    const state = randomBytes(18).toString('base64url');
    this.states.set(state, now + STATE_TTL_MS);
    return { url: TikTokApiClient.authorizeUrl(oauth, TIKTOK_SCOPES, state) };
  }

  /** Le retour de TikTok : échange le code et enregistre la connexion. */
  async complete(input: {
    code?: string | null;
    state?: string | null;
    error?: string | null;
    errorDescription?: string | null;
  }): Promise<TikTokConnectionView> {
    if (input.error) {
      throw badRequest(`TikTok a refusé la connexion : ${input.errorDescription || input.error}`);
    }
    const expiresAt = input.state ? this.states.get(input.state) : undefined;
    if (!input.state || !expiresAt || expiresAt < Date.now()) {
      throw badRequest('Lien de connexion expiré ou inconnu : reclique « Connecter TikTok »');
    }
    this.states.delete(input.state);
    if (!input.code) throw badRequest('Code d’autorisation absent');

    const tokens = await TikTokApiClient.exchangeCode(this.oauth(), input.code);
    const client = new TikTokApiClient(tokens.accessToken);
    const profile = await client.userInfo().catch(() => ({ displayName: null, avatarUrl: null }));
    const creator = tokens.scopes.includes('video.publish')
      ? await client.creatorInfo().catch(() => null)
      : null;

    const connection = this.repository.save({
      openId: tokens.openId,
      username: creator?.username ?? null,
      displayName: profile.displayName ?? creator?.nickname ?? null,
      avatarUrl: profile.avatarUrl ?? creator?.avatarUrl ?? null,
      scopes: tokens.scopes,
      ...this.encrypt(tokens),
    });
    return this.toView(connection);
  }

  /** Le repli : l'adresse de la barre d'adresse après le consentement, collée dans l'écran. */
  completeFromUrl(raw: string): Promise<TikTokConnectionView> {
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw badRequest('Adresse illisible : colle l’adresse complète de la page de retour');
    }
    const params = url.searchParams;
    return this.complete({
      code: params.get('code'),
      state: params.get('state'),
      error: params.get('error'),
      errorDescription: params.get('error_description'),
    });
  }

  disconnect(id: string): void {
    this.repository.delete(id);
  }

  private encrypt(tokens: TikTokTokens) {
    const keys = contexts(tokens.openId);
    return {
      encryptedAccessToken: this.cipher.encrypt(tokens.accessToken, keys.access),
      encryptedRefreshToken: this.cipher.encrypt(tokens.refreshToken, keys.refresh),
      accessExpiresAt: inSeconds(tokens.expiresIn),
      refreshExpiresAt: inSeconds(tokens.refreshExpiresIn),
    };
  }

  // --- Pour Publish -----------------------------------------------------------------

  targets(): PublishTarget[] {
    return this.repository.findAll().map((connection) => ({
      id: connection.id,
      name: connection.username
        ? `@${connection.username}`
        : (connection.displayName ?? 'Compte TikTok'),
      color: '#000000',
    }));
  }

  async session(
    connectionId: string,
  ): Promise<{ accessToken: string; name: string; username: string | null }> {
    const connection = this.repository.findById(connectionId);
    if (!connection) throw notFound('Connexion TikTok');
    const keys = contexts(connection.openId);
    const name = connection.username
      ? `@${connection.username}`
      : (connection.displayName ?? 'Compte TikTok');

    const access = this.cipher.decrypt(connection.encryptedAccessToken, keys.access);
    if (access && Date.parse(connection.accessExpiresAt) - REFRESH_MARGIN_MS > Date.now()) {
      return { accessToken: access, name, username: connection.username };
    }

    const refresh = this.cipher.decrypt(connection.encryptedRefreshToken, keys.refresh);
    if (!refresh)
      throw conflict('Jetons TikTok illisibles (SECRETS_KEY changée) : reconnecte le compte');
    if (Date.parse(connection.refreshExpiresAt) < Date.now()) {
      throw conflict('Connexion TikTok expirée : reconnecte le compte');
    }
    // Le refresh token tourne : le nouveau est écrit tout de suite, l'ancien ne vaut plus.
    const tokens = await TikTokApiClient.refresh(this.oauth(), refresh);
    this.repository.updateTokens(
      connection.id,
      this.encrypt({
        ...tokens,
        openId: connection.openId,
        refreshToken: tokens.refreshToken || refresh,
      }),
    );
    return { accessToken: tokens.accessToken, name, username: connection.username };
  }
}
