import type { IsoDate } from '../../../shared/dates.ts';
import { upstream } from '../../../shared/errors.ts';

/**
 * L'API Instagram, vue de ce qu'elle sait réellement faire.
 *
 * Trois limites décident de tout le module, et aucune n'est contournable :
 *
 * 1. **Les stories ne vivent que 24 heures dans l'API.** Ni archivées, ni à la une, ni
 *    ailleurs : passé ce délai elles n'existent plus, pour personne. Le comptage
 *    « combien de stories ce mois-ci » ne peut donc qu'être archivé au fil de l'eau.
 * 2. **Une story vue par moins de cinq comptes ne renvoie aucune statistique** — l'API
 *    répond une erreur plutôt qu'un zéro. On laisse alors `insightsAt` à `null`, et
 *    l'écran affiche « — ».
 * 3. **`impressions` est mort** (avril 2025), remplacé partout par `views`. `profile_views`
 *    a suivi. Demander une métrique dépréciée fait échouer **toute** la requête, pas
 *    seulement le champ : d'où le repli métrique par métrique plus bas.
 *
 * Le repli est le même parti pris que `YouTubeAnalyticsClient.fetchDailyMetrics`, qui
 * retombe sur les métriques sans revenu quand le scope monétaire manque : mieux vaut une
 * collecte partielle qu'une collecte qui échoue en entier.
 */

const GRAPH = 'https://graph.facebook.com/v23.0';

interface GraphError {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

interface InsightValue {
  value?: number;
  end_time?: string;
}

interface InsightEntry {
  name?: string;
  period?: string;
  values?: InsightValue[];
  total_value?: { value?: number };
}

export interface AccountProfile {
  igUserId: string;
  username: string;
  name: string | null;
  profilePicture: string | null;
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
}

export interface StoryRow {
  id: string;
  mediaType: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  timestamp: string;
}

export interface MediaRow extends StoryRow {
  caption: string | null;
}

/** Le jour **local** d'un horodatage `2026-09-04T14:00:00+0200` : on lit la chaîne. */
export const localDateOf = (timestamp: string): IsoDate => timestamp.slice(0, 10);

export class InstagramClient {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async call<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${GRAPH}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('access_token', this.token);

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    } catch (error) {
      throw upstream(
        `Instagram injoignable : ${error instanceof Error ? error.message : 'erreur réseau'}`,
      );
    }

    const text = await response.text();
    const payload = (text ? JSON.parse(text) : null) as (T & GraphError) | null;

    if (!response.ok || payload?.error) {
      const message = payload?.error?.message ?? `Instagram a répondu ${response.status}`;
      // Le jeton est la panne la plus fréquente, et la plus facile à corriger : on le dit
      // au lieu de laisser un « code 190 » que personne ne sait interpréter.
      if (payload?.error?.code === 190) {
        throw upstream(`Jeton Instagram expiré ou révoqué. Régénère-le. (${message})`);
      }
      throw upstream(message);
    }

    return payload as T;
  }

  /** Le profil et ses compteurs cumulés, en un appel. */
  async fetchProfile(igUserId: string): Promise<AccountProfile> {
    const row = await this.call<{
      id: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
      followers_count?: number;
      follows_count?: number;
      media_count?: number;
    }>(`/${igUserId}`, {
      fields: 'id,username,name,profile_picture_url,followers_count,follows_count,media_count',
    });

    return {
      igUserId: row.id,
      username: row.username ?? '',
      name: row.name ?? null,
      profilePicture: row.profile_picture_url ?? null,
      followersCount: row.followers_count ?? null,
      followsCount: row.follows_count ?? null,
      mediaCount: row.media_count ?? null,
    };
  }

  /**
   * `reach` jour par jour, sur une fenêtre.
   *
   * C'est la **seule** métrique de compte que Meta rend en série quotidienne d'une
   * traite (`metric_type=time_series`). Tout le reste est un total agrégé sur la fenêtre
   * demandée, d'où `fetchDayTotals` juste en dessous.
   *
   * `end_time` est l'horodatage de **fin** du jour mesuré : le jour concerné est la
   * veille. Le prendre tel quel décalerait toute la série d'une journée.
   */
  async fetchReachSeries(
    igUserId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<Map<IsoDate, number>> {
    const result = new Map<IsoDate, number>();
    try {
      const payload = await this.call<{ data?: InsightEntry[] }>(`/${igUserId}/insights`, {
        metric: 'reach',
        period: 'day',
        metric_type: 'time_series',
        since: `${from}T00:00:00+0000`,
        until: `${to}T23:59:59+0000`,
      });

      for (const entry of payload.data ?? []) {
        for (const value of entry.values ?? []) {
          if (value.end_time === undefined || value.value === undefined) continue;
          const end = new Date(value.end_time);
          end.setUTCDate(end.getUTCDate() - 1);
          result.set(end.toISOString().slice(0, 10), value.value);
        }
      }
    } catch (error) {
      console.warn('[instagram] série de portée indisponible :', error);
    }
    return result;
  }

  /**
   * Les totaux d'**une seule journée**.
   *
   * `views`, `total_interactions`, `accounts_engaged` et `profile_links_taps` n'existent
   * qu'en `total_value` : Meta ne les rend pas en série. Obtenir une courbe demande donc
   * une requête par jour — c'est exactement pour ça que la fenêtre de rattrapage de la
   * collecte est courte, remonter trois mois coûterait quatre-vingt-dix requêtes.
   *
   * Les métriques sont demandées **une par une** : une seule d'entre elles rejetée par
   * l'API ferait échouer la requête entière, et on perdrait aussi celles qui marchent.
   */
  async fetchDayTotals(igUserId: string, date: IsoDate): Promise<Record<string, number | null>> {
    const metrics = ['views', 'total_interactions', 'accounts_engaged', 'profile_links_taps'];
    const totals: Record<string, number | null> = {};

    for (const metric of metrics) {
      try {
        const payload = await this.call<{ data?: InsightEntry[] }>(`/${igUserId}/insights`, {
          metric,
          period: 'day',
          metric_type: 'total_value',
          since: `${date}T00:00:00+0000`,
          until: `${date}T23:59:59+0000`,
        });
        totals[metric] = payload.data?.[0]?.total_value?.value ?? null;
      } catch {
        // Métrique refusée (dépréciée, non disponible sur ce compte) : on l'ignore et on
        // garde les autres. Un `null` se lit « — » à l'écran, pas zéro.
        totals[metric] = null;
      }
    }

    return totals;
  }

  /** Les stories **actives**, c'est-à-dire celles des dernières 24 heures. Rien d'autre. */
  async fetchStories(igUserId: string): Promise<StoryRow[]> {
    const payload = await this.call<{
      data?: Array<{
        id: string;
        media_type?: string;
        permalink?: string;
        media_url?: string;
        thumbnail_url?: string;
        timestamp?: string;
      }>;
    }>(`/${igUserId}/stories`, {
      fields: 'id,media_type,permalink,media_url,thumbnail_url,timestamp',
    });

    return (payload.data ?? [])
      .filter((row) => row.timestamp)
      .map((row) => ({
        id: row.id,
        mediaType: row.media_type ?? null,
        permalink: row.permalink ?? null,
        // Une story vidéo n'a pas de `thumbnail_url` mais un `media_url` ; l'inverse pour
        // une image. Prendre la première disponible évite une vignette vide sur la moitié
        // des lignes.
        thumbnailUrl: row.thumbnail_url ?? row.media_url ?? null,
        timestamp: row.timestamp!,
      }));
  }

  /**
   * Les statistiques d'une story.
   *
   * Renvoie `null` quand Meta refuse de répondre — le cas le plus courant étant la story
   * vue par **moins de cinq comptes**, pour laquelle il n'existe aucune donnée. Ce n'est
   * pas une panne : c'est une story confidentielle, et l'écran affichera « — ».
   */
  async fetchStoryInsights(
    storyId: string,
  ): Promise<{ views: number | null; reach: number | null; replies: number | null } | null> {
    try {
      const payload = await this.call<{ data?: InsightEntry[] }>(`/${storyId}/insights`, {
        metric: 'views,reach,replies',
      });

      const read = (name: string): number | null => {
        const entry = payload.data?.find((candidate) => candidate.name === name);
        return entry?.values?.[0]?.value ?? entry?.total_value?.value ?? null;
      };

      const views = read('views');
      const reach = read('reach');
      const replies = read('replies');
      if (views === null && reach === null && replies === null) return null;
      return { views, reach, replies };
    } catch {
      return null;
    }
  }

  /** Les publications les plus récentes : posts, carrousels, reels. */
  async fetchMedia(igUserId: string, limit = 50): Promise<MediaRow[]> {
    const payload = await this.call<{
      data?: Array<{
        id: string;
        media_type?: string;
        caption?: string;
        permalink?: string;
        media_url?: string;
        thumbnail_url?: string;
        timestamp?: string;
      }>;
    }>(`/${igUserId}/media`, {
      fields: 'id,media_type,caption,permalink,media_url,thumbnail_url,timestamp',
      limit: String(limit),
    });

    return (payload.data ?? [])
      .filter((row) => row.timestamp)
      .map((row) => ({
        id: row.id,
        mediaType: row.media_type ?? null,
        caption: row.caption ?? null,
        permalink: row.permalink ?? null,
        thumbnailUrl: row.thumbnail_url ?? row.media_url ?? null,
        timestamp: row.timestamp!,
      }));
  }

  /**
   * Les statistiques d'une publication.
   *
   * Le jeu de métriques dépend du type : un reel n'accepte pas `saved` de la même façon
   * qu'un post, et une métrique refusée ferait échouer la requête entière. On demande donc
   * le lot large, puis on retombe sur le noyau si Meta proteste.
   */
  async fetchMediaInsights(mediaId: string): Promise<{
    views: number | null;
    reach: number | null;
    likes: number | null;
    comments: number | null;
    saved: number | null;
    shares: number | null;
  } | null> {
    const read = (data: InsightEntry[] | undefined, name: string): number | null => {
      const entry = data?.find((candidate) => candidate.name === name);
      return entry?.values?.[0]?.value ?? entry?.total_value?.value ?? null;
    };

    for (const metrics of ['views,reach,likes,comments,saved,shares', 'views,reach']) {
      try {
        const payload = await this.call<{ data?: InsightEntry[] }>(`/${mediaId}/insights`, {
          metric: metrics,
        });
        return {
          views: read(payload.data, 'views'),
          reach: read(payload.data, 'reach'),
          likes: read(payload.data, 'likes'),
          comments: read(payload.data, 'comments'),
          saved: read(payload.data, 'saved'),
          shares: read(payload.data, 'shares'),
        };
      } catch {
        // On retente avec le noyau ; si celui-ci échoue aussi, la publication reste
        // non mesurée et l'écran l'affiche comme telle.
      }
    }
    return null;
  }

  /**
   * Échange un jeton longue durée contre un nouveau, valable 60 jours de plus.
   *
   * Meta ne délivre pas de jeton perpétuel : sans ce rafraîchissement, la collecte
   * s'arrête au bout de deux mois. Il demande l'identifiant et le secret de l'app, d'où
   * les deux variables d'environnement — sans elles, on se contente de prévenir dans
   * l'écran de réglages.
   */
  static async refreshLongLivedToken(
    token: string,
    appId: string,
    appSecret: string,
  ): Promise<{ token: string; expiresAt: string | null }> {
    const url = new URL(`${GRAPH}/oauth/access_token`);
    url.searchParams.set('grant_type', 'fb_exchange_token');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('fb_exchange_token', token);

    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const text = await response.text();
    const payload = (text ? JSON.parse(text) : null) as
      ({ access_token?: string; expires_in?: number } & GraphError) | null;

    if (!response.ok || payload?.error || !payload?.access_token) {
      throw upstream(payload?.error?.message ?? 'Rafraîchissement du jeton refusé');
    }

    return {
      token: payload.access_token,
      expiresAt: payload.expires_in
        ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
        : null,
    };
  }
}
