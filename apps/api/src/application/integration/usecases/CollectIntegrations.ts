import { performance } from 'node:perf_hooks';
import {
  providerDefinition,
  type CollectIntegrationResult,
  type IntegrationProvider,
} from '../../../domain/integration/entities/Integration.ts';
import type {
  DomadooExport,
  DomadooSale,
} from '../../../domain/integration/entities/ExportData.ts';
import type { IntegrationRepository } from '../../../domain/integration/repositories/IntegrationRepository.ts';
import type {
  IntegrationCollectors,
  InstagramProfileSink,
} from '../../../domain/integration/repositories/IntegrationCollectors.ts';
import type { DomadooSnapshotRepository } from '../../../domain/integration/repositories/DomadooSnapshotRepository.ts';
import { round2 } from '../../../domain/integration/services/localeNumber.ts';
import { badRequest, conflict } from '../../../shared/errors.ts';
import { today } from '../../../shared/dates.ts';
import type { ManageIntegrations } from './ManageIntegrations.ts';

/** Euros (le scraper ne parle que ça) → centimes, `null` conservé. */
const toCents = (value: number | null): number | null =>
  value === null ? null : Math.round(value * 100);

/**
 * Les appels HTTP d'abord (Discord, le profil Instagram : une demi-seconde chacun), qui
 * n'ont pas à attendre deux navigateurs.
 */
const COLLECTED_PROVIDERS: IntegrationProvider[] = ['discord', 'instagram', 'amazon', 'domadoo'];

/** Ce que garde l'instantané d'un relevé de profil Instagram, pour l'écran des sources. */
export interface InstagramProfileResult {
  username: string;
  followers: number | null;
  following: number | null;
  posts: number | null;
  source: 'api' | 'searchapi' | 'page';
  approximate: boolean;
  /** Publications listées par le relevé du profil — 0 par la voie `page`. */
  postsListed: number;
  /** Publications déjà connues relues une à une sur leur page, faute de liste. */
  postsRefreshed: number;
}

/**
 * Publications relues une à une quand le profil ne les liste pas. Une requête chacune :
 * au-delà d'une douzaine, on s'expose au blocage qu'on cherche justement à contourner,
 * et les compteurs des publications plus anciennes ne bougent plus guère.
 */
const POST_REFRESH_LIMIT = 12;

/** L'instantané des ventes Domadoo en attente, relevé une fois par jour. */
export const DOMADOO_SALES_KEY = 'domadoo:sales';

/**
 * La collecte des sources distantes : Amazon, Domadoo, Discord.
 *
 * Chaque résultat est **figé** dans `integration_snapshots`, et l'export ne relit que ça :
 * une requête de Home Assistant ne déclenche jamais un navigateur. Un échec est noté à
 * côté de la dernière bonne valeur, sans la remplacer — un captcha un mardi ne doit pas
 * faire tomber le capteur de gains à zéro.
 *
 * Un verrou par source : le passage horaire et un clic sur « Collecter » ne lancent pas
 * deux navigateurs connectés au même compte, ce qui est exactement ce qui fait tomber sur
 * un captcha.
 */
export class CollectIntegrations {
  private readonly repo: IntegrationRepository;
  private readonly manage: ManageIntegrations;
  private readonly collectors: IntegrationCollectors;
  private readonly instagram: InstagramProfileSink;
  private readonly domadooSnapshots: DomadooSnapshotRepository;
  private readonly running = new Set<string>();

  constructor(
    repo: IntegrationRepository,
    manage: ManageIntegrations,
    collectors: IntegrationCollectors,
    instagram: InstagramProfileSink,
    domadooSnapshots: DomadooSnapshotRepository,
  ) {
    this.repo = repo;
    this.manage = manage;
    this.collectors = collectors;
    this.instagram = instagram;
    this.domadooSnapshots = domadooSnapshots;
  }

  /** Toutes les sources actives et configurées, l'une après l'autre. */
  async collectAll(): Promise<CollectIntegrationResult[]> {
    const results: CollectIntegrationResult[] = [];
    for (const provider of COLLECTED_PROVIDERS) {
      if (this.shouldSkip(provider)) {
        results.push({ provider, status: 'skipped', message: null, durationMs: 0 });
        continue;
      }
      try {
        results.push(await this.collectOne(provider));
      } catch (error) {
        // Le seul cas qui lève ici est le verrou : une collecte manuelle tourne déjà.
        results.push({
          provider,
          status: 'skipped',
          message: error instanceof Error ? error.message : String(error),
          durationMs: 0,
        });
      }
    }
    return results;
  }

  /**
   * Ce que le passage horaire saute.
   *
   * **Instagram obéit à deux règles à part.** Son interrupteur ne dit que « publier dans
   * l'export » : le relevé alimente aussi l'écran Instagram, et couper la publication ne
   * doit pas arrêter l'historique. Et il ne tourne qu'**une fois par jour** — un relevé
   * quotidien suffit à une courbe d'abonnés, et Instagram bloque vite une adresse qui lit
   * un profil toutes les heures. Un échec, lui, est retenté au passage suivant : c'est la
   * dernière *réussite* du jour qui fait foi.
   */
  private shouldSkip(provider: IntegrationProvider): boolean {
    if (this.manage.resolve(provider).missing.length > 0) return true;
    if (provider !== 'instagram') return !this.repo.isEnabled(provider);
    return this.repo.snapshot(provider)?.fetchedAt?.slice(0, 10) === today();
  }

  async collectOne(provider: IntegrationProvider): Promise<CollectIntegrationResult> {
    const definition = providerDefinition(provider);
    if (!definition.collectable) {
      throw badRequest(
        `${definition.label} est alimenté par la collecte du studio : il n’y a rien à collecter ici.`,
      );
    }
    const { values, missing } = this.manage.resolve(provider);
    if (missing.length > 0) {
      throw badRequest(`Identifiants incomplets pour ${definition.label} : ${missing.join(', ')}`);
    }

    return this.run(provider, provider, () => {
      switch (provider) {
        case 'amazon':
          return this.collectors.amazon.fetch({
            login: values.login!,
            password: values.password!,
            otpSecret: values.otpSecret ?? null,
          });
        case 'domadoo':
          return this.collectDomadoo({ login: values.login!, password: values.password! });
        case 'discord':
          return this.collectors.discord.fetch(values.inviteCode!);
        case 'instagram':
          return this.collectInstagram(values.profile!, values.searchApiKey ?? null);
        default:
          throw badRequest(`Aucun collecteur pour ${definition.label}`);
      }
    });
  }

  /**
   * Le relevé quotidien des ventes Domadoo en attente.
   *
   * Séparé du résumé horaire parce qu'il se pagine — une page par vingt ventes — et que
   * les commissions en attente ne bougent pas d'une heure à l'autre.
   */
  async collectDomadooSales(): Promise<CollectIntegrationResult> {
    const { values, missing } = this.manage.resolve('domadoo');
    if (!this.repo.isEnabled('domadoo') || missing.length > 0) {
      return { provider: 'domadoo', status: 'skipped', message: null, durationMs: 0 };
    }
    return this.run(DOMADOO_SALES_KEY, 'domadoo', () =>
      this.collectors.domadoo.waitingSales({ login: values.login!, password: values.password! }),
    );
  }

  /**
   * Le relevé du profil public : il est **écrit dans le module Instagram** (compte + relevé
   * du jour), d'où l'export le relit comme n'importe quel compte. L'instantané n'en garde
   * qu'un résumé, pour que l'écran des sources dise d'où vient le chiffre et s'il est
   * arrondi.
   */
  private async collectInstagram(
    profile: string,
    searchApiKey: string | null,
  ): Promise<InstagramProfileResult> {
    const fetched = await this.collectors.instagram.fetch(profile, searchApiKey);
    const { accountId, username } = this.instagram.recordPublicProfile(fetched);

    // La voie `page` ne liste aucune publication : sans ce second temps, les j'aime et
    // commentaires restaient figés à la dernière lecture réussie de la liste. La page de
    // chaque publication, elle, reste lisible quand l'adresse du serveur est bloquée.
    let postsRefreshed = 0;
    if (fetched.recentPosts.length === 0) {
      for (const media of this.instagram.postsToRefresh(accountId, POST_REFRESH_LIMIT)) {
        try {
          this.instagram.recordPostStats(
            media.id,
            await this.collectors.instagram.fetchPost(media.permalink),
          );
          postsRefreshed += 1;
        } catch (error) {
          // Une publication supprimée ou illisible ne doit pas faire échouer le relevé.
          console.warn(`[instagram] ${media.permalink} :`, error);
        }
      }
    }

    return {
      username,
      followers: fetched.followers,
      following: fetched.following,
      posts: fetched.posts,
      source: fetched.source,
      approximate: fetched.approximate,
      postsListed: fetched.recentPosts.length,
      postsRefreshed,
    };
  }

  private async collectDomadoo(credentials: {
    login: string;
    password: string;
  }): Promise<DomadooExport> {
    // Au tout premier passage, le relevé des ventes n'existe pas encore : sans lui, le
    // total en attente resterait vide jusqu'à 3 h du matin. Son échec n'empêche pas le
    // résumé.
    if (!this.repo.snapshot(DOMADOO_SALES_KEY)?.fetchedAt) await this.collectDomadooSales();

    const summary = await this.collectors.domadoo.summary(credentials);
    const sales = this.repo.snapshot(DOMADOO_SALES_KEY)?.data;
    const waitingSalesTotal = Array.isArray(sales)
      ? round2((sales as DomadooSale[]).reduce((total, sale) => total + (sale.commission ?? 0), 0))
      : null;

    // Un relevé de plus dans l'historique : c'est lui qui permet à l'écran Affiliations →
    // Domadoo de naviguer dans le passé, là où `integration_snapshots` n'écrase jamais
    // que le dernier. Un seul par jour — la collecte tourne toutes les heures, la
    // dernière écrase la précédente.
    this.domadooSnapshots.upsert({
      date: today(),
      clicks: summary.total.clicks,
      uniqueClicks: summary.total.uniquesClicks,
      approvedSales: summary.total.approvedSales,
      earningsCents: toCents(summary.total.earnings),
      paymentsCents: toCents(summary.total.payments),
      waitingPaymentsCents: toCents(summary.total.waitingPayments),
      balanceCents: toCents(summary.total.balance),
      waitingSalesCents: toCents(waitingSalesTotal),
    });

    return { ...summary, last30days: { ...summary.last30days, waitingSalesTotal } };
  }

  private async run(
    key: string,
    provider: IntegrationProvider,
    work: () => Promise<unknown>,
  ): Promise<CollectIntegrationResult> {
    if (this.running.has(key)) {
      throw conflict(`Une collecte ${providerDefinition(provider).label} est déjà en cours`);
    }
    this.running.add(key);
    const started = performance.now();
    try {
      const data = await work();
      const durationMs = performance.now() - started;
      this.repo.saveSuccess(key, data, durationMs);
      return { provider, status: 'ok', message: null, durationMs: Math.round(durationMs) };
    } catch (error) {
      const durationMs = performance.now() - started;
      const message = error instanceof Error ? error.message : String(error);
      this.repo.saveFailure(key, message, durationMs);
      return { provider, status: 'error', message, durationMs: Math.round(durationMs) };
    } finally {
      this.running.delete(key);
    }
  }
}
