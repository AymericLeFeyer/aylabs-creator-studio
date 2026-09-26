/**
 * Les objectifs : une métrique, une fenêtre de temps, une valeur cible. « 10 000 abonnés
 * sur la chaîne principale d'ici décembre », « 2 000 € d'AdSense cumulés ».
 *
 * Contrairement aux paliers (`achievement`), un objectif est **choisi** et donc stocké
 * (table `goals`) ; sa progression, elle, se recalcule à chaque lecture depuis
 * l'historique, comme les paliers — rien ne peut diverger des autres écrans.
 *
 * Écran Audience → Succès, en tête.
 */

/** La famille choisie en premier dans le formulaire. */
export type GoalCategory =
  | 'youtube'
  | 'adsense'
  | 'instagram'
  | 'tiktok'
  | 'discord'
  | 'products'
  | 'sponsorships'
  | 'affiliation'
  | 'amazon'
  | 'domadoo'
  | 'money';

/** Le type d'entité auquel une métrique se rattache. `null` = globale. */
export type GoalEntityKind = 'youtube' | 'instagram' | 'tiktok';

/** `cents` : le front divise par 100, comme partout. */
export type GoalUnit = 'count' | 'cents' | 'hours';

export type GoalMetricId =
  | 'youtube.subscribers'
  | 'youtube.views'
  | 'youtube.videos'
  | 'youtube.watchHours'
  | 'youtube.likes'
  | 'youtube.comments'
  | 'youtube.shares'
  | 'adsense.revenue'
  | 'instagram.followers'
  | 'instagram.posts'
  | 'instagram.stories'
  | 'instagram.reach'
  | 'instagram.views'
  | 'instagram.interactions'
  | 'tiktok.followers'
  | 'tiktok.hearts'
  | 'tiktok.videos'
  | 'discord.members'
  | 'products.count'
  | 'products.value'
  | 'sponsorships.count'
  | 'sponsorships.amount'
  | 'affiliation.revenue'
  | 'amazon.earnings'
  | 'amazon.clicks'
  | 'amazon.ordered'
  | 'domadoo.earnings'
  | 'domadoo.clicks'
  | 'domadoo.sales'
  | 'money.revenue'
  | 'money.cash'
  | 'money.profit';

export interface GoalMetricDefinition {
  id: GoalMetricId;
  category: GoalCategory;
  label: string;
  /** Une phrase : ce que la valeur compte exactement. */
  description: string;
  unit: GoalUnit;
  entity: GoalEntityKind | null;
  /** Entité facultative : sans elle, la métrique se somme sur toutes (AdSense). */
  entityOptional: boolean;
}

export const GOAL_CATEGORIES: Array<{ id: GoalCategory; label: string }> = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'adsense', label: 'AdSense' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'discord', label: 'Discord' },
  { id: 'products', label: 'Produits reçus' },
  { id: 'sponsorships', label: 'Sponsors' },
  { id: 'affiliation', label: 'Affiliation' },
  { id: 'amazon', label: 'Amazon' },
  { id: 'domadoo', label: 'Domadoo' },
  { id: 'money', label: "Chiffre d'affaires" },
];

const m = (
  id: GoalMetricId,
  label: string,
  description: string,
  unit: GoalUnit,
  entity: GoalEntityKind | null = null,
  entityOptional = false,
): GoalMetricDefinition => ({
  id,
  category: id.split('.')[0] as GoalCategory,
  label,
  description,
  unit,
  entity,
  entityOptional,
});

/**
 * Tout ce qui peut servir d'objectif. **Toutes les valeurs sont des cumuls** : un total à
 * une date (abonnés, vues au total) ou la somme d'un flux depuis le début de l'historique
 * (AdSense, produits reçus). C'est ce qui permet une seule règle de progression —
 * `(valeur − départ) / (cible − départ)` — quelle que soit la métrique.
 */
export const GOAL_METRICS: GoalMetricDefinition[] = [
  m('youtube.subscribers', 'Abonnés', 'Le total d’abonnés de la chaîne.', 'count', 'youtube'),
  m('youtube.views', 'Vues au total', 'Les vues cumulées de la chaîne.', 'count', 'youtube'),
  m('youtube.videos', 'Vidéos publiées', 'Le nombre de vidéos en ligne.', 'count', 'youtube'),
  m(
    'youtube.watchHours',
    'Heures de visionnage',
    'Cumulées depuis le début de l’historique collecté.',
    'hours',
    'youtube',
  ),
  m('youtube.likes', "J'aime", 'Cumulés depuis le début de l’historique.', 'count', 'youtube'),
  m(
    'youtube.comments',
    'Commentaires',
    'Cumulés depuis le début de l’historique.',
    'count',
    'youtube',
  ),
  m('youtube.shares', 'Partages', 'Cumulés depuis le début de l’historique.', 'count', 'youtube'),
  m(
    'adsense.revenue',
    'AdSense cumulé',
    'Les revenus AdSense cumulés. Sans chaîne : toutes les chaînes additionnées.',
    'cents',
    'youtube',
    true,
  ),
  m('instagram.followers', 'Abonnés', 'Le total d’abonnés du compte.', 'count', 'instagram'),
  m(
    'instagram.posts',
    'Publications',
    'Le nombre de publications du compte.',
    'count',
    'instagram',
  ),
  m('instagram.stories', 'Stories', 'Archivées depuis la première collecte.', 'count', 'instagram'),
  m(
    'instagram.reach',
    'Portée cumulée',
    'La portée quotidienne additionnée.',
    'count',
    'instagram',
  ),
  m(
    'instagram.views',
    'Vues cumulées',
    'Les vues quotidiennes additionnées.',
    'count',
    'instagram',
  ),
  m(
    'instagram.interactions',
    'Interactions cumulées',
    'Les interactions quotidiennes additionnées.',
    'count',
    'instagram',
  ),
  m('tiktok.followers', 'Abonnés', 'Le total d’abonnés du profil.', 'count', 'tiktok'),
  m('tiktok.hearts', 'Coeurs', 'Le total de coeurs du profil.', 'count', 'tiktok'),
  m('tiktok.videos', 'Vidéos publiées', 'Le nombre de vidéos du profil.', 'count', 'tiktok'),
  m('discord.members', 'Membres', 'Les membres du serveur Discord.', 'count'),
  m('products.count', 'Produits reçus', 'Le nombre de produits reçus, cumulé.', 'count'),
  m(
    'products.value',
    'Valeur des produits reçus',
    'La valeur des produits reçus, cumulée.',
    'cents',
  ),
  m('sponsorships.count', 'Sponsos encaissées', 'Le nombre de sponsos payées, cumulé.', 'count'),
  m(
    'sponsorships.amount',
    'Montant des sponsos',
    'Le montant des sponsos payées, cumulé.',
    'cents',
  ),
  m(
    'affiliation.revenue',
    "Revenus d'affiliation",
    'Les revenus de la catégorie Affiliation.',
    'cents',
  ),
  m('amazon.earnings', 'Gains Amazon', 'Les gains Partenaires, cumulés mois après mois.', 'cents'),
  m('amazon.clicks', 'Clics Amazon', 'Les clics sur les liens, cumulés.', 'count'),
  m('amazon.ordered', 'Articles commandés', 'Les articles commandés via Amazon, cumulés.', 'count'),
  m('domadoo.earnings', 'Gains Domadoo', 'Les gains depuis l’ouverture du compte.', 'cents'),
  m('domadoo.clicks', 'Clics Domadoo', 'Les clics depuis l’ouverture du compte.', 'count'),
  m('domadoo.sales', 'Ventes validées', 'Les ventes validées par Domadoo.', 'count'),
  m('money.revenue', 'CA total', 'AdSense, revenus saisis et produits reçus, cumulés.', 'cents'),
  m('money.cash', 'CA encaissé', 'Le CA sans les produits reçus, cumulé.', 'cents'),
  m('money.profit', 'Bénéfice', 'Le CA total moins les dépenses, cumulé.', 'cents'),
];

export const findGoalMetric = (id: string): GoalMetricDefinition | undefined =>
  GOAL_METRICS.find((metric) => metric.id === id);

export interface Goal {
  id: string;
  /** Libre ; vide, l'écran compose « Abonnés · Ma chaîne ». */
  title: string;
  metric: GoalMetricId;
  /** Chaîne ou compte. `null` pour une métrique globale, ou AdSense toutes chaînes. */
  entityId: string | null;
  startDate: string;
  endDate: string;
  /** Relevée automatiquement à la création (valeur au jour de départ), modifiable. */
  startValue: number;
  targetValue: number;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface GoalInput {
  title?: string;
  metric: GoalMetricId;
  entityId?: string | null;
  startDate: string;
  endDate: string;
  startValue: number;
  targetValue: number;
  color?: string;
}

export type GoalUpdate = Partial<GoalInput>;

export interface GoalPoint {
  date: string;
  value: number;
}

/**
 * - `upcoming` : la date de départ n'est pas encore arrivée ;
 * - `achieved` : la cible a été atteinte (même après l'échéance, `achievedAt` le date) ;
 * - `on_track` / `behind` : en cours, selon que la progression suit le temps écoulé ;
 * - `missed` : échéance passée sans atteindre la cible.
 */
export type GoalStatus = 'upcoming' | 'achieved' | 'on_track' | 'behind' | 'missed';

export interface GoalView extends Goal {
  category: GoalCategory;
  metricLabel: string;
  unit: GoalUnit;
  entityName: string | null;
  entityColor: string | null;
  /** Dernière valeur connue, bornée à l'échéance. `null` sans aucun relevé. */
  current: number | null;
  currentDate: string | null;
  /** `(current − start) / (target − start)`, non borné : 1,2 = cible dépassée de 20 %. */
  progress: number | null;
  /** La part du temps écoulé, entre 0 et 1 : ce que `progress` devrait valoir pour tenir. */
  elapsed: number;
  achievedAt: string | null;
  status: GoalStatus;
  /** Du départ à aujourd'hui (ou à l'échéance), un point par jour. */
  series: GoalPoint[];
}

/** Ce que le formulaire relit en direct : valeur de départ et prévision. */
export interface GoalPreview {
  startValue: number | null;
  current: number | null;
  currentDate: string | null;
  /** Valeur attendue à `endDate` au rythme des 90 derniers jours. */
  projected: number | null;
  /** Rythme retenu, par jour. */
  dailyRate: number | null;
}

export interface GoalEntity {
  id: string;
  name: string;
  color: string;
}

export interface GoalCatalog {
  categories: Array<{ id: GoalCategory; label: string }>;
  metrics: GoalMetricDefinition[];
  entities: Record<GoalEntityKind, GoalEntity[]>;
}
