import type {
  AmazonExport,
  DiscordExport,
  DomadooSale,
  DomadooSummary,
} from '../entities/ExportData.ts';
import type { TikTokPublicProfile } from '../../tiktok/entities/TikTokAccount.ts';

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
  tiktok: {
    /** `profile` : adresse du profil ou @pseudo, tel que saisi. */
    fetch(profile: string): Promise<TikTokPublicProfile>;
  };
}

/**
 * Où va un profil TikTok relevé : dans les tables du module TikTok, et non dans un
 * instantané d'export. C'est ce qui donne un **historique jour par jour** (courbe
 * d'abonnés) et ce qui fait que l'export, calculé depuis la base, n'a rien à savoir de la
 * voie par laquelle le chiffre est arrivé — même parti pris que l'ancien profil public
 * Instagram, dont ce module reprend l'architecture.
 */
export interface TikTokProfileSink {
  recordPublicProfile(profile: TikTokPublicProfile): { accountId: string; username: string };
}
