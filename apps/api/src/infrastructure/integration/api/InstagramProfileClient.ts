import type {
  InstagramPublicPost,
  InstagramPublicProfile,
} from '../../../domain/instagram/entities/InstagramAccount.ts';
import { badRequest, upstream } from '../../../shared/errors.ts';

/** Le client web d'Instagram : sans cet en-tête, l'endpoint JSON répond 400. */
const IG_APP_ID = '936619743392459';

const ANDROID_UA =
  'Instagram 76.0.0.15.395 Android (24/7.0; 640dpi; 1440x2560; samsung; SM-G930F; herolte; samsungexynos8890; en_US; 138226743)';

/**
 * Le robot d'aperçu de Facebook : Instagram lui sert la page d'un profil **avec** ses
 * balises Open Graph, là où un navigateur anonyme reçoit une page vide à hydrater.
 */
const PREVIEW_UA = 'facebookexternalhit/1.1';

const USERNAME = /^[A-Za-z0-9._]{1,30}$/;

/**
 * Ramène ce qu'on colle dans le champ à un nom d'utilisateur : `@aylabs`, `aylabs`,
 * `https://www.instagram.com/aylabs/?hl=fr` donnent tous `aylabs`.
 */
export const parseInstagramUsername = (input: string): string => {
  const trimmed = input.trim();
  const fromUrl = /instagram\.com\/([^/?#]+)/i.exec(trimmed)?.[1];
  const username = (fromUrl ?? trimmed).replace(/^@/, '');
  if (!USERNAME.test(username)) {
    throw badRequest(
      `« ${input} » n’est ni un nom d’utilisateur ni une adresse de profil Instagram.`,
    );
  }
  return username;
};

interface WebProfileInfo {
  data?: {
    user?: {
      id?: string;
      username?: string;
      full_name?: string;
      profile_pic_url_hd?: string;
      profile_pic_url?: string;
      edge_followed_by?: { count?: number };
      edge_follow?: { count?: number };
      edge_owner_to_timeline_media?: {
        count?: number;
        edges?: Array<{ node?: WebProfilePost }>;
      };
    } | null;
  };
}

interface WebProfilePost {
  id?: string;
  shortcode?: string;
  __typename?: string;
  is_video?: boolean;
  product_type?: string;
  taken_at_timestamp?: number;
  display_url?: string;
  thumbnail_src?: string;
  video_view_count?: number;
  edge_media_to_caption?: { edges?: Array<{ node?: { text?: string } }> };
  edge_liked_by?: { count?: number };
  edge_media_preview_like?: { count?: number };
  edge_media_to_comment?: { count?: number };
}

/**
 * Une publication telle que SearchAPI la décrit. Le format n'est pas documenté champ par
 * champ : les noms alternatifs sont lus tous, et une publication sans identifiant ni date
 * est ignorée plutôt que d'être datée au hasard.
 */
interface SearchApiPost {
  id?: string;
  shortcode?: string;
  link?: string;
  permalink?: string;
  type?: string;
  caption?: string;
  text?: string;
  thumbnail?: string;
  image?: string;
  likes?: number;
  comments?: number;
  views?: number;
  video_views?: number;
  iso_date?: string;
  date?: string;
  timestamp?: number;
}

interface SearchApiProfile {
  profile?: {
    id?: string;
    username?: string;
    name?: string;
    full_name?: string;
    avatar?: string;
    avatar_hd?: string;
    followers?: number;
    following?: number;
    posts?: number;
  };
  posts?: SearchApiPost[];
  error?: string;
}

/**
 * Les compteurs du **profil public** d'un compte Instagram : abonnés, abonnements,
 * publications. Aucun jeton, aucun compte Meta.
 *
 * Trois voies, essayées dans cet ordre, parce qu'aucune n'est garantie :
 *
 * 1. `web_profile_info` — l'endpoint JSON du site, celui de l'ancien exporter. Chiffres
 *    **exacts**, mais Instagram le limite par adresse IP et répond vite 429 ;
 * 2. SearchAPI.io, si une clé est fournie — un service payant qui fait la même lecture
 *    depuis ses propres adresses ;
 * 3. la page du profil, lue comme le robot d'aperçu de Facebook : ses balises Open Graph
 *    portent « 1,234 Followers, 56 Following, 78 Posts ». Toujours servie, mais
 *    **arrondie** au-delà de dix mille (« 12.3K »).
 *
 * Toutes échouent-elles, l'erreur les cite toutes : « 429 » seul ne dirait pas qu'il
 * existe un repli à configurer.
 */
export class InstagramProfileClient {
  async fetch(profile: string, searchApiKey: string | null): Promise<InstagramPublicProfile> {
    const username = parseInstagramUsername(profile);
    const failures: string[] = [];

    const attempts: Array<[string, () => Promise<InstagramPublicProfile>]> = [
      ['API', () => this.fromApi(username)],
      ...(searchApiKey
        ? ([['SearchAPI', () => this.fromSearchApi(username, searchApiKey)]] as Array<
            [string, () => Promise<InstagramPublicProfile>]
          >)
        : []),
      ['page', () => this.fromPage(username)],
    ];

    for (const [label, attempt] of attempts) {
      try {
        return await attempt();
      } catch (error) {
        failures.push(`${label} : ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw upstream(`Profil Instagram @${username} illisible (${failures.join(' ; ')})`);
  }

  private async fromApi(username: string): Promise<InstagramPublicProfile> {
    const response = await fetch(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        headers: { 'User-Agent': ANDROID_UA, Accept: 'application/json', 'x-ig-app-id': IG_APP_ID },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) throw new Error(`réponse ${response.status}`);

    const user = ((await response.json()) as WebProfileInfo).data?.user;
    if (!user) throw new Error('compte introuvable');
    return {
      igId: user.id ?? null,
      username: user.username ?? username,
      fullName: user.full_name || null,
      profilePicture: user.profile_pic_url_hd ?? user.profile_pic_url ?? null,
      followers: user.edge_followed_by?.count ?? null,
      following: user.edge_follow?.count ?? null,
      posts: user.edge_owner_to_timeline_media?.count ?? null,
      source: 'api',
      approximate: false,
      recentPosts: (user.edge_owner_to_timeline_media?.edges ?? [])
        .map((edge) => edge.node)
        .filter((node): node is WebProfilePost => node !== undefined)
        .flatMap((node): InstagramPublicPost[] => {
          if (!node.id || !node.taken_at_timestamp) return [];
          return [
            {
              id: node.id,
              mediaType: webMediaType(node),
              caption: node.edge_media_to_caption?.edges?.[0]?.node?.text ?? null,
              permalink: node.shortcode ? `https://www.instagram.com/p/${node.shortcode}/` : null,
              thumbnailUrl: node.thumbnail_src ?? node.display_url ?? null,
              postedAt: new Date(node.taken_at_timestamp * 1000).toISOString(),
              likes: node.edge_liked_by?.count ?? node.edge_media_preview_like?.count ?? null,
              comments: node.edge_media_to_comment?.count ?? null,
              views: node.is_video ? (node.video_view_count ?? null) : null,
            },
          ];
        }),
    };
  }

  private async fromSearchApi(username: string, apiKey: string): Promise<InstagramPublicProfile> {
    const url = new URL('https://www.searchapi.io/api/v1/search');
    url.searchParams.set('engine', 'instagram_profile');
    url.searchParams.set('username', username);
    url.searchParams.set('api_key', apiKey);
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`réponse ${response.status}`);

    const body = (await response.json()) as SearchApiProfile;
    if (!body.profile) throw new Error(body.error ?? 'profil absent de la réponse');
    const { profile } = body;
    return {
      igId: profile.id ?? null,
      username: profile.username ?? username,
      fullName: profile.name ?? profile.full_name ?? null,
      profilePicture: profile.avatar_hd ?? profile.avatar ?? null,
      followers: profile.followers ?? null,
      following: profile.following ?? null,
      posts: profile.posts ?? null,
      source: 'searchapi',
      approximate: false,
      recentPosts: (body.posts ?? []).flatMap((post): InstagramPublicPost[] => {
        const id = post.id ?? post.shortcode;
        const postedAt = searchApiDate(post);
        if (!id || !postedAt) return [];
        return [
          {
            id,
            mediaType: searchApiMediaType(post.type),
            caption: post.caption ?? post.text ?? null,
            permalink:
              post.link ??
              post.permalink ??
              (post.shortcode ? `https://www.instagram.com/p/${post.shortcode}/` : null),
            thumbnailUrl: post.thumbnail ?? post.image ?? null,
            postedAt,
            likes: post.likes ?? null,
            comments: post.comments ?? null,
            views: post.views ?? post.video_views ?? null,
          },
        ];
      }),
    };
  }

  private async fromPage(username: string): Promise<InstagramPublicProfile> {
    const response = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
      headers: { 'User-Agent': PREVIEW_UA, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) throw new Error('compte introuvable');
    if (!response.ok) throw new Error(`réponse ${response.status}`);

    const html = await response.text();
    const description = decodeEntities(metaContent(html, 'og:description') ?? '');
    // « 1,234 Followers, 56 Following, 78 Posts - See Instagram photos and videos from … »
    const counts =
      /([\d.,]+[KMB]?)\s+Followers?,\s*([\d.,]+[KMB]?)\s+Following,\s*([\d.,]+[KMB]?)\s+Posts?/i.exec(
        description,
      );
    if (!counts) {
      throw new Error('compteurs absents de la page (compte privé, ou page modifiée)');
    }

    const [followers, following, posts] = [counts[1]!, counts[2]!, counts[3]!].map(parseCount);
    const title = decodeEntities(metaContent(html, 'og:title') ?? '');
    return {
      igId: /"profilePage_(\d+)"/.exec(html)?.[1] ?? null,
      username,
      // « Instagram (@instagram) • Instagram photos and videos »
      fullName: /^(.*?)\s*\(@/.exec(title)?.[1]?.trim() || null,
      profilePicture: decodeEntities(metaContent(html, 'og:image') ?? '') || null,
      followers: followers!.value,
      following: following!.value,
      posts: posts!.value,
      source: 'page',
      approximate: [followers, following, posts].some((count) => count!.approximate),
      // Les balises Open Graph ne décrivent que le profil, aucune publication.
      recentPosts: [],
    };
  }
}

/** Ramène le type du site aux libellés de l'API Graph, ceux que connaît l'écran. */
const webMediaType = (node: WebProfilePost): string | null => {
  if (node.product_type === 'clips') return 'REELS';
  if (node.__typename === 'GraphSidecar') return 'CAROUSEL_ALBUM';
  if (node.__typename === 'GraphVideo' || node.is_video) return 'VIDEO';
  if (node.__typename === 'GraphImage') return 'IMAGE';
  return null;
};

const searchApiMediaType = (type: string | undefined): string | null => {
  const normalized = type?.toLowerCase() ?? '';
  if (/reel|clip/.test(normalized)) return 'REELS';
  if (/carousel|sidecar|album/.test(normalized)) return 'CAROUSEL_ALBUM';
  if (/video/.test(normalized)) return 'VIDEO';
  if (/image|photo/.test(normalized)) return 'IMAGE';
  return null;
};

const searchApiDate = (post: SearchApiPost): string | null => {
  if (post.timestamp) return new Date(post.timestamp * 1000).toISOString();
  const raw = post.iso_date ?? post.date;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
};

const metaContent = (html: string, property: string): string | null =>
  new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`, 'i').exec(html)?.[1] ?? null;

const decodeEntities = (text: string): string =>
  text
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

const SUFFIXES: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9 };

/** « 8,584 » → 8584 exact ; « 12.3K » → 12 300, arrondi. */
const parseCount = (raw: string): { value: number; approximate: boolean } => {
  const suffix = raw.at(-1)!.toUpperCase();
  if (suffix in SUFFIXES) {
    return {
      value: Math.round(Number(raw.slice(0, -1).replace(/,/g, '')) * SUFFIXES[suffix]!),
      approximate: true,
    };
  }
  return { value: Number(raw.replace(/[.,]/g, '')), approximate: false };
};
