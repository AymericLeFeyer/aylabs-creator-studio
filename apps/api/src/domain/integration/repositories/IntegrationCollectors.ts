import type {
  AmazonExport,
  DiscordExport,
  DomadooSale,
  DomadooSummary,
} from '../entities/ExportData.ts';
import type {
  InstagramPublicPostPage,
  InstagramPublicProfile,
} from '../../instagram/entities/InstagramAccount.ts';
import type { InstagramMedia } from '../../instagram/entities/InstagramStory.ts';

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
    /** Une publication lue sur sa propre page : la voie que le blocage par IP laisse passer. */
    fetchPost(url: string): Promise<InstagramPublicPostPage>;
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
  /**
   * Les publications déjà archivées d'un compte suivi par son profil public, à relire une
   * à une sur leur page. Vide pour un compte à jeton : l'API Graph s'en charge.
   */
  postsToRefresh(accountId: string, limit: number): Array<{ id: string; permalink: string }>;
  recordPostStats(mediaId: string, post: InstagramPublicPostPage): void;
  /** Une publication ajoutée par son lien, rangée sous le compte de son auteur. */
  recordPublicPost(post: InstagramPublicPostPage): InstagramMedia;
}
