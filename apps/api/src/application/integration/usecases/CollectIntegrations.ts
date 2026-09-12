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
import type { IntegrationCollectors } from '../../../domain/integration/repositories/IntegrationCollectors.ts';
import { round2 } from '../../../domain/integration/services/localeNumber.ts';
import { badRequest, conflict } from '../../../shared/errors.ts';
import type { ManageIntegrations } from './ManageIntegrations.ts';

/** Discord d'abord : un appel HTTP d'une demi-seconde, qui n'a pas à attendre deux navigateurs. */
const REMOTE_PROVIDERS: IntegrationProvider[] = ['discord', 'amazon', 'domadoo'];

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
  private readonly running = new Set<string>();

  constructor(
    repo: IntegrationRepository,
    manage: ManageIntegrations,
    collectors: IntegrationCollectors,
  ) {
    this.repo = repo;
    this.manage = manage;
    this.collectors = collectors;
  }

  /** Toutes les sources actives et configurées, l'une après l'autre. */
  async collectAll(): Promise<CollectIntegrationResult[]> {
    const results: CollectIntegrationResult[] = [];
    for (const provider of REMOTE_PROVIDERS) {
      if (!this.repo.isEnabled(provider) || this.manage.resolve(provider).missing.length > 0) {
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

  async collectOne(provider: IntegrationProvider): Promise<CollectIntegrationResult> {
    const definition = providerDefinition(provider);
    if (definition.kind === 'local') {
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
