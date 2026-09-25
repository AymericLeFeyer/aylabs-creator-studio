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
    // Toujours vide en pratique (vérifié le 2026-09-25, y compris sur des comptes à plus
    // de mille vidéos) : la liste vient du widget intégré, voir `fetchRecentVideos`.
    itemList?: UniversalVideoItem[];
  };
}

interface UniversalData {
  __DEFAULT_SCOPE__?: {
    'webapp.user-detail'?: UserDetailScope;
    'webapp.video-detail'?: { statusCode?: number; itemInfo?: { itemStruct?: UniversalVideoItem } };
  };
}

/** Une vidéo telle que le widget intégré la rend : ni date, ni j'aime, mais les vues. */
interface EmbedVideo {
  id?: string;
  desc?: string;
  coverUrl?: string;
  originCoverUrl?: string;
  playCount?: number;
  privateItem?: boolean;
}

interface EmbedState {
  source?: { data?: Record<string, { videoList?: EmbedVideo[] }> };
}

const UNIVERSAL_DATA = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i;
const EMBED_STATE = /<script id="__FRONTITY_CONNECT_STATE__"[^>]*>([\s\S]*?)<\/script>/i;

/**
 * L'instant de publication **encodé dans l'identifiant** : les 32 bits de poids fort d'un
 * identifiant de vidéo TikTok sont un horodatage Unix en secondes. C'est le repli quand la
 * page de la vidéo ne répond pas — le widget, lui, ne donne aucune date.
 */
const postedAtFromId = (id: string): string | null => {
  try {
    const seconds = Number(BigInt(id) >> 32n);
    return seconds > 1_400_000_000 ? new Date(seconds * 1000).toISOString() : null;
  } catch {
    return null;
  }
};

const HEADERS = {
  'User-Agent': DESKTOP_UA,
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml',
};

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
        headers: HEADERS,
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok)
      throw upstream(`Profil TikTok @${username} illisible (réponse ${response.status})`);

    const html = await response.text();
    const match = UNIVERSAL_DATA.exec(html);
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

    const uniqueId = info.user?.uniqueId ?? username;
    const listed: TikTokPublicVideo[] = (info.itemList ?? []).flatMap(
      (item): TikTokPublicVideo[] => {
        if (!item.id || !item.createTime) return [];
        return [
          {
            id: item.id,
            description: item.desc || null,
            permalink: `https://www.tiktok.com/@${uniqueId}/video/${item.id}`,
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

    // `itemList` est vide en pratique : le widget intégré prend le relais. Son échec ne
    // fait jamais échouer le relevé du compte, les compteurs du profil sont déjà là.
    const recentVideos = listed.length > 0 ? listed : await this.fetchRecentVideos(uniqueId);

    return {
      username: uniqueId,
      fullName: info.user?.nickname || null,
      profilePicture: info.user?.avatarLarger ?? info.user?.avatarMedium ?? null,
      followers: info.stats?.followerCount ?? null,
      following: info.stats?.followingCount ?? null,
      hearts: info.stats?.heartCount ?? info.stats?.heart ?? null,
      videoCount: info.stats?.videoCount ?? null,
      source: 'json',
      approximate: false,
      recentVideos,
    };
  }

  /**
   * Les 10 dernières vidéos, par le **widget « profil intégré »** (`/embed/@pseudo`) : la
   * seule page publique qui les liste sans signature ni navigateur — l'API interne
   * (`/api/post/item_list`) répond vide sans jeton signé, et `itemList` du profil aussi.
   *
   * Le widget ne donne que l'identifiant, la description, la miniature et les vues. Chaque
   * vidéo est donc complétée par **sa propre page** (j'aime, commentaires, partages, heure
   * exacte). Dix lectures une fois par jour : c'est le rythme de la collecte TikTok
   * (`shouldSkip`). Une page qui échoue garde les vues du widget et la date tirée de
   * l'identifiant ; un compteur absent ne remplace jamais un chiffre connu
   * (`COALESCE` de `upsertVideo`).
   */
  private async fetchRecentVideos(username: string): Promise<TikTokPublicVideo[]> {
    let listed: EmbedVideo[];
    try {
      const response = await fetch(
        `https://www.tiktok.com/embed/@${encodeURIComponent(username)}`,
        { headers: HEADERS, signal: AbortSignal.timeout(15_000) },
      );
      const match = EMBED_STATE.exec(await response.text());
      const state = match ? (JSON.parse(match[1]!) as EmbedState) : null;
      listed = state?.source?.data?.[`/embed/@${username}`]?.videoList ?? [];
    } catch (error) {
      console.warn(`[tiktok] widget @${username} illisible :`, (error as Error).message);
      return [];
    }

    const videos: TikTokPublicVideo[] = [];
    for (const item of listed) {
      if (!item.id || item.privateItem) continue;
      const detail = await this.fetchVideoDetail(username, item.id);
      const postedAt = detail?.createTime
        ? new Date(detail.createTime * 1000).toISOString()
        : postedAtFromId(item.id);
      if (!postedAt) continue;
      videos.push({
        id: item.id,
        description: detail?.desc || item.desc || null,
        permalink: `https://www.tiktok.com/@${username}/video/${item.id}`,
        thumbnailUrl: item.coverUrl ?? item.originCoverUrl ?? null,
        postedAt,
        views: detail?.stats?.playCount ?? item.playCount ?? null,
        likes: detail?.stats?.diggCount ?? null,
        comments: detail?.stats?.commentCount ?? null,
        shares: detail?.stats?.shareCount ?? null,
      });
    }
    return videos;
  }

  /** La page d'une vidéo : ses compteurs et son heure de publication. `null` si illisible. */
  private async fetchVideoDetail(username: string, id: string): Promise<UniversalVideoItem | null> {
    try {
      const response = await fetch(
        `https://www.tiktok.com/@${encodeURIComponent(username)}/video/${id}?lang=en`,
        { headers: HEADERS, signal: AbortSignal.timeout(15_000) },
      );
      const match = UNIVERSAL_DATA.exec(await response.text());
      if (!match) return null;
      const detail = (JSON.parse(match[1]!) as UniversalData).__DEFAULT_SCOPE__?.[
        'webapp.video-detail'
      ];
      return (detail?.statusCode ?? 0) === 0 ? (detail?.itemInfo?.itemStruct ?? null) : null;
    } catch {
      return null;
    }
  }
}
