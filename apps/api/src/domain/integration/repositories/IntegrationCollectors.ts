import type {
  AmazonExport,
  DiscordExport,
  DomadooSale,
  DomadooSummary,
} from '../entities/ExportData.ts';

/** Les collecteurs distants, vus du use case : il ne sait pas qu'un navigateur tourne derrière. */
export interface IntegrationCollectors {
  amazon: {
    fetch(credentials: {
      login: string;
      password: string;
      otpSecret: string | null;
    }): Promise<AmazonExport>;
  };
  domadoo: {
    summary(credentials: { login: string; password: string }): Promise<DomadooSummary>;
    waitingSales(credentials: { login: string; password: string }): Promise<DomadooSale[]>;
  };
  discord: {
    fetch(inviteCode: string): Promise<DiscordExport>;
  };
}
