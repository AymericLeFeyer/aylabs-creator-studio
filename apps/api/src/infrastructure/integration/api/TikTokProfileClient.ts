import type {
  TikTokPublicProfile,
  TikTokPublicVideo,
} from '../../../domain/tiktok/entities/TikTokAccount.ts';
import { badRequest, upstream } from '../../../shared/errors.ts';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const USERNAME = /^[A-Za-z0-9._]{1,24}$/;

/**
 * Ramène ce qu'on colle dans le champ à un nom d'utilisateur : `@aylabs`, `aylabs`,
 * `https://www.tiktok.com/@aylabs?lang=fr` donnent tous `aylabs`. Même fonction que
 * `parseInstagramUsername`, adaptée au format TikTok (le point est permis).
 */
export const parseTikTokUsername = (input: string): string => {
  const trimmed = input.trim();
  const fromUrl = /tiktok\.com\/@([^/?#]+)/i.exec(trimmed)?.[1];
  const username = (fromUrl ?? trimmed).replace(/^@/, '');
  if (!USERNAME.test(username)) {
    throw badRequest(`« ${input} » n’est ni un nom d’utilisateur ni une adresse de profil TikTok.`);
  }
  return username;
};

interface UserDetailScope {
  statusCode?: number;
  statusMsg?: string;
  userInfo?: {
    user?: {
      id?: string;
      /** Le @pseudo (URL, mentions) — `nickname` est le nom affiché, pas celui-ci. */
      uniqueId?: string;
      nickname?: string;
      avatarLarger?: string;
      avatarMedium?: string;
    };
    stats?: {
      followerCount?: number;
      followingCount?: number;
      heartCount?: number;
      heart?: number;
      videoCount?: number;
    };
    // Présent sur certaines réponses, vide sur d'autres — la plupart des profils testés
    // ne le portent pas : la liste des vidéos vient alors des lectures déjà archivées,
    // rafraîchies une à une, comme le repli d'Instagram sans jeton.
    itemList?: UniversalVideoItem[];
  };
}

interface UniversalData {
  __DEFAULT_SCOPE__?: { 'webapp.user-detail'?: UserDetailScope };
}

interface UniversalVideoItem {
  id?: string;
  desc?: string;
  createTime?: number;
  video?: { cover?: string; dynamicCover?: string };
  stats?: { diggCount?: number; commentCount?: number; shareCount?: number; playCount?: number };
}

/**
 * Les compteurs du **profil public** d'un compte TikTok : abonnés, abonnements, cœurs.
 * Aucune API officielle — TikTok ne l'ouvre qu'à des partenaires validés — donc la même
 * approche que l'ancien profil public Instagram : lire la page telle qu'un visiteur la
 * voit.
 *
 * **Une seule voie, contrairement à Instagram** : la page ne sert aucune balise Open
 * Graph exploitable (vérifié en conditions réelles — ni `og:description`, ni
 * `name="description"`), tout tient dans le JSON du rendu serveur
 * (`__UNIVERSAL_DATA_FOR_REHYDRATION__`, bloc `webapp.user-detail`). Ses chiffres sont
 * des **entiers exacts**, jamais arrondis — contrairement à Instagram, `approximate` vaut
 * donc toujours `false` ici. `itemList` (les vidéos récentes) est présent sur certains
 * profils, vide sur la plupart : son absence ne fait pas échouer le relevé.
 */
export class TikTokProfileClient {
  async fetch(profile: string): Promise<TikTokPublicProfile> {
    const username = parseTikTokUsername(profile);
    const response = await fetch(
      `https://www.tiktok.com/@${encodeURIComponent(username)}?lang=en`,
      {
        headers: {
          'User-Agent': DESKTOP_UA,
          'Accept-Language': 'en-US,en;q=0.9',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok)
      throw upstream(`Profil TikTok @${username} illisible (réponse ${response.status})`);

    const html = await response.text();
    const match = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i.exec(
      html,
    );
    if (!match) {
      throw upstream(
        `Compteurs absents de la page TikTok @${username} : le rendu du site a changé de forme.`,
      );
    }

    const detail = (JSON.parse(match[1]!) as UniversalData).__DEFAULT_SCOPE__?.[
      'webapp.user-detail'
    ];
    const info = detail?.userInfo;
    if (!info || (detail.statusCode ?? 0) !== 0) {
      throw upstream(
        `Compte TikTok @${username} introuvable ou inaccessible` +
          (detail?.statusMsg ? ` (${detail.statusMsg})` : '') +
          '.',
      );
    }

    const recentVideos: TikTokPublicVideo[] = (info.itemList ?? []).flatMap(
      (item): TikTokPublicVideo[] => {
        if (!item.id || !item.createTime) return [];
        return [
          {
            id: item.id,
            description: item.desc || null,
            permalink: `https://www.tiktok.com/@${info.user?.uniqueId ?? username}/video/${item.id}`,
            thumbnailUrl: item.video?.dynamicCover ?? item.video?.cover ?? null,
            postedAt: new Date(item.createTime * 1000).toISOString(),
            views: item.stats?.playCount ?? null,
            likes: item.stats?.diggCount ?? null,
            comments: item.stats?.commentCount ?? null,
            shares: item.stats?.shareCount ?? null,
          },
        ];
      },
    );

    return {
      username: info.user?.uniqueId ?? username,
      fullName: info.user?.nickname || null,
      profilePicture: info.user?.avatarLarger ?? info.user?.avatarMedium ?? null,
      followers: info.stats?.followerCount ?? null,
      following: info.stats?.followingCount ?? null,
      hearts: info.stats?.heartCount ?? info.stats?.heart ?? null,
      source: 'json',
      approximate: false,
      recentVideos,
    };
  }
}
