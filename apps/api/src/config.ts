import { resolve } from 'node:path';

const optional = (key: string): string | null => {
  const value = process.env[key]?.trim();
  return value ? value : null;
};

const bool = (key: string, fallback: boolean): boolean => {
  const value = optional(key);
  if (value === null) return fallback;
  return value === 'true' || value === '1';
};

const int = (key: string, fallback: number): number => {
  const value = Number(optional(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export interface Config {
  port: number;
  databasePath: string;
  youtubeApiKey: string | null;
  gcpClientId: string | null;
  gcpClientSecret: string | null;
  /**
   * Identifiants de l'app Meta. Facultatifs : sans eux tout fonctionne, mais le jeton
   * Instagram doit être régénéré à la main tous les 60 jours au lieu d'être échangé
   * automatiquement.
   */
  metaAppId: string | null;
  metaAppSecret: string | null;
  collectCron: string;
  collectAtStartup: boolean;
  backfillDays: number;
  corsOrigins: string[];
}

export const loadConfig = (): Config => ({
  port: int('PORT', 3001),
  databasePath: resolve(process.cwd(), optional('DATABASE_PATH') ?? './data/creator-studio.db'),
  youtubeApiKey: optional('YOUTUBE_API_KEY'),
  gcpClientId: optional('GCP_CLIENT_ID'),
  gcpClientSecret: optional('GCP_CLIENT_SECRET'),
  metaAppId: optional('META_APP_ID'),
  metaAppSecret: optional('META_APP_SECRET'),
  // Toutes les heures : YouTube consolide ses chiffres en continu, inutile d'aller plus vite.
  collectCron: optional('COLLECT_CRON') ?? '0 * * * *',
  collectAtStartup: bool('COLLECT_AT_STARTUP', false),
  // 2 ans de rattrapage au premier ajout d'une chaîne OAuth.
  backfillDays: int('BACKFILL_DAYS', 730),
  corsOrigins: (optional('CORS_ORIGINS') ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
});
