import type { DateRange } from '../../domain/metrics/repositories/MetricsRepository.ts';

export interface EntryFilter {
  range?: DateRange;
  channelIds?: string[];
  includeUnassigned?: boolean;
}

/** Génère `?, ?, ?` pour une clause IN de longueur variable. */
export const placeholders = (n: number): string => Array.from({ length: n }, () => '?').join(', ');

/**
 * Traduit un filtre métier en clause WHERE.
 *
 * Une sélection de chaînes vide ne filtre rien (vue cumulée). Sinon les entrées non
 * rattachées à une chaîne restent incluses par défaut : une sponso globale doit
 * apparaître dans le total, même si on regarde une chaîne en particulier — le front
 * peut le désactiver via `includeUnassigned: false`.
 */
export const buildEntryWhere = (
  filter: EntryFilter,
  alias = 'e',
): { clause: string; params: unknown[] } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.range) {
    conditions.push(`${alias}.date BETWEEN ? AND ?`);
    params.push(filter.range.from, filter.range.to);
  }

  const channelIds = filter.channelIds ?? [];
  if (channelIds.length > 0) {
    const includeUnassigned = filter.includeUnassigned !== false;
    const inClause = `${alias}.channel_id IN (${placeholders(channelIds.length)})`;
    conditions.push(includeUnassigned ? `(${inClause} OR ${alias}.channel_id IS NULL)` : inClause);
    params.push(...channelIds);
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
};
