import type { PublishTarget } from '../entities/Publish.ts';

/** Ce que Publish a besoin de savoir des connexions TikTok, sans toucher aux jetons chiffrés. */
export interface TikTokPublishAccess {
  /** `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` renseignées. */
  readonly configured: boolean;
  targets(): PublishTarget[];
  /** Un jeton d'accès valide, rafraîchi au besoin. */
  session(
    connectionId: string,
  ): Promise<{ accessToken: string; name: string; username: string | null }>;
}
