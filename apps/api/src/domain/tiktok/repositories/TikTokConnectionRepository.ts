import type { SaveTikTokConnectionInput, TikTokConnection } from '../entities/TikTokConnection.ts';

export interface TikTokConnectionRepository {
  findAll(): TikTokConnection[];
  findById(id: string): TikTokConnection | null;
  /** Crée la connexion, ou remplace celle du même `openId` (reconnecter un compte). */
  save(input: SaveTikTokConnectionInput): TikTokConnection;
  updateTokens(
    id: string,
    tokens: Pick<
      SaveTikTokConnectionInput,
      'encryptedAccessToken' | 'encryptedRefreshToken' | 'accessExpiresAt' | 'refreshExpiresAt'
    >,
  ): void;
  delete(id: string): void;
}
