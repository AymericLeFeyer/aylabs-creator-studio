import type {
  AmazonExport,
  DiscordExport,
  DomadooSale,
  DomadooSummary,
} from '../entities/ExportData.ts';
import type { InstagramPublicProfile } from '../../instagram/entities/InstagramAccount.ts';

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
  instagram: {
    /** `profile` : adresse du profil ou @pseudo, tel que saisi. */
    fetch(profile: string, searchApiKey: string | null): Promise<InstagramPublicProfile>;
  };
}

/**
 * Où va un profil Instagram relevé : dans les tables du module Instagram, et non dans un
 * instantané d'export. C'est ce qui donne un **historique jour par jour** (courbe
 * d'abonnés, gain sur la période) et ce qui fait que l'export, calculé depuis la base,
 * n'a rien à savoir de la voie par laquelle le chiffre est arrivé.
 */
export interface InstagramProfileSink {
  recordPublicProfile(profile: InstagramPublicProfile): { accountId: string; username: string };
}
