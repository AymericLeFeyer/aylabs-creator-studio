/**
 * Une connexion OAuth à un compte TikTok (« Login Kit » + « Content Posting API »), pour
 * **publier** depuis Production → Publish. Rien à voir avec `TikTokAccount`, qui suit un
 * profil public sans jeton : les deux vivent côte à côte, la connexion ne sert qu'à envoyer.
 *
 * Les deux jetons sont **chiffrés** (`SecretBox`, contextes `tiktok:access:<openId>` et
 * `tiktok:refresh:<openId>`) et ne sortent jamais de l'API. Le jeton d'accès ne vit que
 * quelques heures (`expires_in`), le refresh token 180 jours — et il **tourne** : chaque
 * rafraîchissement en rend un neuf, l'ancien ne vaut plus rien.
 */
export interface TikTokConnection {
  id: string;
  openId: string;
  /** `creator_username` si le scope `video.publish` est accordé, sinon `null`. */
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  scopes: string[];
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TikTokConnectionView {
  id: string;
  openId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  scopes: string[];
  refreshExpiresAt: string;
  /** `false` : `SECRETS_KEY` a changé, les jetons sont illisibles — reconnecter. */
  readable: boolean;
}

/** Ce que l'écran de connexion doit savoir. */
export interface TikTokOAuthStatus {
  /** `TIKTOK_CLIENT_KEY` et `TIKTOK_CLIENT_SECRET` sont renseignées. */
  configured: boolean;
  /** L'adresse de retour à déclarer dans le portail TikTok, `null` sans `PUBLIC_URL`. */
  redirectUri: string | null;
  secretsKeyConfigured: boolean;
  scopes: string[];
  connections: TikTokConnectionView[];
}

export interface SaveTikTokConnectionInput {
  openId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  scopes: string[];
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}
