import type {
  InstagramAccountRepository,
  InstagramDataRepository,
} from '../../../domain/instagram/repositories/InstagramRepository.ts';
import {
  InstagramClient,
  localDateOf,
} from '../../../infrastructure/instagram/api/InstagramClient.ts';
import { addDays, today, type IsoDate } from '../../../shared/dates.ts';
import { badRequest, notFound } from '../../../shared/errors.ts';

/**
 * Jours de flux re-demandés à chaque passage.
 *
 * Meta annonce jusqu'à **48 heures** de délai sur ses agrégats : repartir du lendemain
 * de la dernière collecte figerait des chiffres encore provisoires. Même raisonnement que
 * `REVISION_WINDOW_DAYS` côté YouTube, avec une marge de sécurité.
 */
const REVISION_WINDOW_DAYS = 3;

/**
 * Rattrapage à la première collecte d'un compte.
 *
 * Court volontairement : les métriques de compte ne sont retenues que **90 jours** chez
 * Meta, et surtout tout ce qui n'est pas `reach` demande **une requête par jour**.
 * Remonter trois mois coûterait près de quatre cents appels pour un compte.
 */
const BACKFILL_DAYS = 30;

/** Fenêtre de rafraîchissement des publications : au-delà, les compteurs ne bougent plus. */
const MEDIA_REFRESH_DAYS = 60;

export interface InstagramCollectResult {
  accountId: string;
  username: string;
  storiesFound: number;
  storiesMeasured: number;
  mediaUpserted: number;
  mediaMeasured: number;
  daysCollected: number;
  error: string | null;
}

/**
 * La collecte Instagram.
 *
 * **L'ordre des quatre étapes n'est pas indifférent.** Les stories passent en premier :
 * ce sont les seules données qu'on ne pourra jamais rattraper, et un quota épuisé ou une
 * erreur en fin de parcours ne doit pas les faire manquer. Les publications, elles,
 * restent disponibles deux ans — les perdre une fois n'est pas grave.
 *
 * Chaque étape est **isolée** : son échec est journalisé et n'interrompt pas les autres.
 * Une métrique de compte refusée ne doit pas empêcher d'archiver les stories du jour, qui
 * auront disparu dans vingt-quatre heures.
 */
export class CollectInstagram {
  private readonly accounts: InstagramAccountRepository;
  private readonly data: InstagramDataRepository;
  private readonly appId: string | null;
  private readonly appSecret: string | null;

  constructor(
    accounts: InstagramAccountRepository,
    data: InstagramDataRepository,
    options: { appId: string | null; appSecret: string | null } = { appId: null, appSecret: null },
  ) {
    this.accounts = accounts;
    this.data = data;
    this.appId = options.appId;
    this.appSecret = options.appSecret;
  }

  /** Collecte tous les comptes actifs. Un échec par compte n'arrête pas les suivants. */
  async collectAll(): Promise<InstagramCollectResult[]> {
    const results: InstagramCollectResult[] = [];
    for (const view of this.accounts.findAll()) {
      results.push(await this.collectOne(view.id));
    }
    return results;
  }

  async collectOne(accountId: string): Promise<InstagramCollectResult> {
    const account = this.accounts.findById(accountId);
    if (!account) throw notFound('Compte Instagram');
    if (!account.accessToken) {
      throw badRequest(`Aucun jeton pour @${account.username}. Renseigne-le dans les réglages.`);
    }

    const client = new InstagramClient(account.accessToken);
    const result: InstagramCollectResult = {
      accountId: account.id,
      username: account.username,
      storiesFound: 0,
      storiesMeasured: 0,
      mediaUpserted: 0,
      mediaMeasured: 0,
      daysCollected: 0,
      error: null,
    };

    // 1. Les stories d'abord : elles disparaissent dans 24 h, tout le reste peut attendre.
    try {
      const stories = await client.fetchStories(account.igUserId);
      result.storiesFound = stories.length;

      for (const story of stories) {
        const row = this.data.upsertStory({
          accountId: account.id,
          igMediaId: story.id,
          mediaType: story.mediaType,
          permalink: story.permalink,
          thumbnailUrl: story.thumbnailUrl,
          postedAt: story.timestamp,
          date: localDateOf(story.timestamp),
        });

        // On ne remesure pas une story déjà mesurée : ses chiffres sont figés, et
        // chaque appel coûte du quota qu'on préfère garder pour en attraper d'autres.
        if (row.insightsAt) continue;

        const insights = await client.fetchStoryInsights(story.id);
        // `null` = moins de cinq vues, Meta refuse de répondre. Ce n'est pas une panne :
        // la ligne reste non mesurée et l'écran affichera « — » plutôt qu'un zéro faux.
        if (insights) {
          this.data.setStoryInsights(row.id, insights);
          result.storiesMeasured += 1;
        }
      }
    } catch (error) {
      result.error = message(error);
      console.warn(`[instagram] stories de @${account.username} :`, error);
    }

    // 2. Le profil : abonnés, abonnements, nombre de publications.
    try {
      const profile = await client.fetchProfile(account.igUserId);
      this.data.upsertSnapshot({
        accountId: account.id,
        date: today(),
        followersCount: profile.followersCount,
        followsCount: profile.followsCount,
        mediaCount: profile.mediaCount,
      });

      this.accounts.update(account.id, {
        username: profile.username || account.username,
        name: profile.name,
        profilePicture: profile.profilePicture,
      });
    } catch (error) {
      result.error ??= message(error);
      console.warn(`[instagram] profil de @${account.username} :`, error);
    }

    // 3. Les compteurs quotidiens.
    try {
      result.daysCollected = await this.collectDailyMetrics(client, account.id, account.igUserId);
    } catch (error) {
      result.error ??= message(error);
      console.warn(`[instagram] métriques de @${account.username} :`, error);
    }

    // 4. Les publications, en dernier : deux ans de rétention, rien d'urgent.
    try {
      const media = await client.fetchMedia(account.igUserId);
      for (const item of media) {
        this.data.upsertMedia({
          accountId: account.id,
          igMediaId: item.id,
          mediaType: item.mediaType,
          caption: item.caption,
          permalink: item.permalink,
          thumbnailUrl: item.thumbnailUrl,
          postedAt: item.timestamp,
          date: localDateOf(item.timestamp),
        });
        result.mediaUpserted += 1;
      }

      // Les compteurs des publications récentes bougent encore ; les anciennes sont
      // figées et les redemander gaspillerait du quota.
      for (const row of this.data.findMediaToRefresh(
        account.id,
        addDays(today(), -MEDIA_REFRESH_DAYS),
      )) {
        const insights = await client.fetchMediaInsights(row.igMediaId);
        if (insights) {
          this.data.setMediaInsights(row.id, insights);
          result.mediaMeasured += 1;
        }
      }
    } catch (error) {
      result.error ??= message(error);
      console.warn(`[instagram] publications de @${account.username} :`, error);
    }

    this.accounts.update(account.id, { lastCollectedAt: new Date().toISOString() });
    return result;
  }

  /**
   * Les compteurs jour par jour.
   *
   * `reach` arrive en série d'une traite ; les autres métriques n'existent qu'en total
   * agrégé, donc **une requête par jour**. C'est ce qui borne la fenêtre : on repart du
   * dernier jour connu moins la fenêtre de révision, et jamais plus loin que
   * `BACKFILL_DAYS`.
   */
  private async collectDailyMetrics(
    client: InstagramClient,
    accountId: string,
    igUserId: string,
  ): Promise<number> {
    const last = this.data.findLastMetricDate(accountId);
    const start = last
      ? maxDate(addDays(last, -REVISION_WINDOW_DAYS), addDays(today(), -BACKFILL_DAYS))
      : addDays(today(), -BACKFILL_DAYS);
    const end = today();

    const reach = await client.fetchReachSeries(igUserId, start, end);

    let days = 0;
    for (let date = start; date <= end; date = addDays(date, 1)) {
      const totals = await client.fetchDayTotals(igUserId, date);
      this.data.upsertDailyMetric({
        accountId,
        date,
        reach: reach.get(date) ?? null,
        views: totals.views ?? null,
        totalInteractions: totals.total_interactions ?? null,
        accountsEngaged: totals.accounts_engaged ?? null,
        profileLinksTaps: totals.profile_links_taps ?? null,
      });
      days += 1;
    }

    return days;
  }

  /**
   * Rafraîchit le jeton longue durée d'un compte.
   *
   * Meta n'en délivre pas de perpétuel : sans ça, la collecte s'arrête au bout de deux
   * mois. Demande l'identifiant et le secret de l'app — sans eux, l'écran se contente de
   * prévenir de l'échéance.
   */
  async refreshToken(accountId: string): Promise<{ expiresAt: string | null }> {
    const account = this.accounts.findById(accountId);
    if (!account) throw notFound('Compte Instagram');
    if (!account.accessToken) throw badRequest('Aucun jeton à rafraîchir.');
    if (!this.appId || !this.appSecret) {
      throw badRequest(
        'Renseigne META_APP_ID et META_APP_SECRET pour rafraîchir automatiquement le jeton.',
      );
    }

    const refreshed = await InstagramClient.refreshLongLivedToken(
      account.accessToken,
      this.appId,
      this.appSecret,
    );
    this.accounts.update(accountId, {
      accessToken: refreshed.token,
      tokenExpiresAt: refreshed.expiresAt,
    });
    return { expiresAt: refreshed.expiresAt };
  }
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : 'Erreur inconnue';

const maxDate = (a: IsoDate, b: IsoDate): IsoDate => (a > b ? a : b);
