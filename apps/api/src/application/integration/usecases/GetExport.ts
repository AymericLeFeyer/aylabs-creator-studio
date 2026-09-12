import {
  PROVIDERS,
  providerDefinition,
  type IntegrationProvider,
} from '../../../domain/integration/entities/Integration.ts';
import type {
  ExportEntry,
  ExportPayload,
} from '../../../domain/integration/entities/ExportData.ts';
import type { IntegrationRepository } from '../../../domain/integration/repositories/IntegrationRepository.ts';
import type { ManageIntegrations } from './ManageIntegrations.ts';

/**
 * Ce que lit Home Assistant : une entrée par source, `null` quand elle est désactivée ou
 * n'a encore rien collecté.
 *
 * **Les clés sont toujours présentes**, même à `null` : un gabarit Home Assistant qui
 * lit `value_json.amazon.thisMonth` doit tomber sur un vide, pas sur une clé absente qui
 * fait échouer tout le capteur REST.
 *
 * Rien ne se collecte ici. Les sources distantes relisent leur dernier instantané, les
 * locales se calculent depuis la base — une requête d'export répond donc en quelques
 * millisecondes, même toutes les minutes.
 */
export class GetExport {
  private readonly repo: IntegrationRepository;
  private readonly manage: ManageIntegrations;

  constructor(repo: IntegrationRepository, manage: ManageIntegrations) {
    this.repo = repo;
    this.manage = manage;
  }

  execute(): ExportPayload {
    const entries = Object.fromEntries(
      PROVIDERS.map((provider) => [provider.id, this.entry(provider.id)]),
    ) as Record<IntegrationProvider, ExportEntry | null>;
    return { generatedAt: new Date().toISOString(), ...entries };
  }

  entry(provider: IntegrationProvider): ExportEntry | null {
    if (!this.repo.isEnabled(provider)) return null;

    if (providerDefinition(provider).kind === 'local') {
      const data = this.manage.localData(provider);
      return data ? { ...data } : null;
    }

    const snapshot = this.repo.snapshot(provider);
    if (!snapshot || snapshot.data === null || typeof snapshot.data !== 'object') return null;
    // L'heure publiée est celle de la donnée, pas celle de la dernière tentative : un
    // capteur « dernière mise à jour » doit vieillir quand la collecte échoue.
    return { ...(snapshot.data as Record<string, unknown>), lastUpdate: snapshot.fetchedAt };
  }
}
