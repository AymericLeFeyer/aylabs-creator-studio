/**
 * Contrat de `/api/achievements`, dupliqué depuis l'API comme tout le reste du front.
 * **Toute évolution doit être répercutée des deux côtés.** Les paliers, eux, ne vivent
 * que côté API : le front affiche ce qu'on lui envoie.
 */
export type AchievementPlatform = 'youtube' | 'instagram' | 'tiktok';

export type AchievementMetric =
  'subscribers' | 'views' | 'videos' | 'adsense' | 'followers' | 'posts' | 'stories' | 'hearts';

/** `cents` pour AdSense : le front divise par 100, comme partout. */
export type AchievementUnit = 'count' | 'cents';

export interface AchievementPoint {
  date: string;
  value: number;
}

export interface Milestone {
  threshold: number;
  /** « 1 000 abonnés », « Première vidéo ». */
  title: string;
  /** Le jour où le palier a été franchi. `null` s'il ne l'est pas, ou l'a été avant l'historique. */
  reachedAt: string | null;
  /**
   * Franchi **avant le début de l'historique** : on sait qu'il l'est, pas quand. Plutôt
   * qu'une date inventée — celle du premier relevé, qui serait fausse —, l'écran dit
   * « avant le … ».
   */
  before: boolean;
}

/** Une courbe cumulée et ses paliers : les abonnés d'une chaîne, les publications d'un compte. */
export interface AchievementTrack {
  /** `youtube:<channelId>:subscribers` — stable, sert de clé à l'écran. */
  id: string;
  platform: AchievementPlatform;
  entityId: string;
  entityName: string;
  entityColor: string;
  metric: AchievementMetric;
  /** « Abonnés », « Vues », « Vidéos publiées »… */
  label: string;
  unit: AchievementUnit;
  current: number | null;
  /** Premier point connu. */
  historyStart: string | null;
  /**
   * L'historique ne couvre pas toute la vie du compte : la courbe démarre quelque part en
   * route (stories archivées depuis la première collecte, AdSense depuis le rattrapage…).
   */
  partialHistory: boolean;
  series: AchievementPoint[];
  milestones: Milestone[];
}

/** Un record : la meilleure journée, la vidéo la plus vue, le seuil de monétisation. */
export interface AchievementRecord {
  id: string;
  platform: AchievementPlatform;
  entityId: string;
  entityName: string;
  entityColor: string;
  /** La métrique qu'il révèle, pour que le front applique la confidentialité. */
  metric: AchievementMetric;
  title: string;
  /** `null` pour un événement sans valeur (seuil du Programme Partenaire). */
  value: number | null;
  unit: AchievementUnit;
  date: string | null;
  /** Le titre de la vidéo, la légende de la publication… */
  detail: string | null;
}

export interface AchievementsView {
  tracks: AchievementTrack[];
  records: AchievementRecord[];
}
