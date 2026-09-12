import type { AnalyticsParams } from '../infrastructure/analytics/api/analyticsApi.ts';
import type { CategoryListParams } from '../infrastructure/category/api/categoryApi.ts';
import type { BrandStatsParams } from '../infrastructure/brand/api/brandApi.ts';

/**
 * Clés de cache centralisées : toute mutation invalide par préfixe, ce qui évite
 * d'oublier une vue lors d'un ajout de revenu ou d'une collecte.
 */
export const queryKeys = {
  channels: (includeArchived: boolean) => ['channels', includeArchived] as const,
  categories: (params: CategoryListParams) => ['categories', params] as const,
  revenues: (params: unknown) => ['revenues', params] as const,
  expenses: (params: unknown) => ['expenses', params] as const,
  videos: (params: unknown) => ['videos', params] as const,
  analytics: (params: AnalyticsParams) => ['analytics', params] as const,

  brands: (includeArchived: boolean) => ['brands', includeArchived] as const,
  brandStats: (params: BrandStatsParams) => ['brandStats', params] as const,
  productions: (params: unknown) => ['productions', params] as const,
  production: (id: string) => ['productions', 'detail', id] as const,
  // Le format fait partie de la clé, mais sous la même racine : une écriture qui invalide
  // `['productionOverview']` emporte les trois versions d'un coup (tout, vidéos, shorts).
  productionOverview: (format?: string) => ['productionOverview', format ?? 'all'] as const,
  productionSteps: (includeArchived: boolean) => ['productionSteps', includeArchived] as const,
  productionSlots: (params: unknown) => ['productionSlots', params] as const,
  stepTodos: (includeArchived: boolean) => ['stepTodos', includeArchived] as const,
  productionTodos: (id: string) => ['productionTodos', id] as const,
  productionTime: (params: unknown) => ['productionTime', params] as const,
  runningTimer: () => ['runningTimer'] as const,
  recurringExpenses: () => ['recurringExpenses'] as const,
  products: (params: unknown) => ['products', params] as const,
  sponsorships: (params: unknown) => ['sponsorships', params] as const,
  ideas: (format?: string) => ['ideas', format ?? 'all'] as const,
  scriptPresets: (includeArchived: boolean) => ['scriptPresets', includeArchived] as const,
  shotAngles: (includeArchived: boolean) => ['shotAngles', includeArchived] as const,
  productionShotAngles: (id: string) => ['productionShotAngles', id] as const,
  comments: (params: unknown) => ['comments', params] as const,
  commentCounts: (channelIds: string[]) => ['commentCounts', channelIds] as const,

  legalOverview: () => ['legalOverview'] as const,
  legalObligations: (includeArchived: boolean) => ['legalObligations', includeArchived] as const,
  legalBookmarks: (includeArchived: boolean) => ['legalBookmarks', includeArchived] as const,
  affiliatePlatforms: (params: unknown) => ['affiliatePlatforms', params] as const,

  planningBoard: (params: unknown) => ['planningBoard', params] as const,
  planningItems: () => ['planningItems'] as const,
  planningSettings: () => ['planningSettings'] as const,
  workHours: () => ['workHours'] as const,
  calendars: () => ['calendars'] as const,

  instagramOverview: (params: unknown) => ['instagramOverview', params] as const,
  instagramAccounts: (includeArchived: boolean) => ['instagramAccounts', includeArchived] as const,

  // Paramètres → API. Aucune autre racine ne les croise : ce que le studio publie à
  // l'extérieur ne change ni un chiffre, ni une alerte, ni une file.
  integrations: () => ['integrations'] as const,
  exportKeys: () => ['exportKeys'] as const,
};

/** Racines à invalider après une écriture qui change les chiffres agrégés. */
export const MONEY_ROOTS = ['analytics', 'revenues', 'expenses'] as const;

/**
 * Ce qu'une collecte réécrit, et qui doit donc repartir avec elle.
 *
 * **`videos` en fait partie**, et c'est le piège : une collecte n'écrit pas que des
 * séries, elle insère aussi les sorties. Sans cette racine, `/api/analytics` repartait
 * bien — la vidéo apparaissait sur le dashboard et dans le catalogue — pendant que les
 * **sélecteurs de rattachement** (« Marquer publiée », le champ vidéo d'un revenu ou d'une
 * dépense) continuaient de servir une liste d'avant la collecte, jusqu'à cinq minutes
 * durant. La vidéo qu'on venait de publier était visible partout sauf là où on voulait
 * s'y rattacher.
 *
 * `channels` y est aussi : la collecte met à jour la miniature, le compte d'abonnés et
 * l'identifiant de chaîne. Et une `VideoView` embarque le nom et la couleur de sa chaîne,
 * ce qui fait que toute écriture de chaîne doit elle aussi emporter `videos`.
 */
export const COLLECT_ROOTS = ['analytics', 'channels', 'videos'] as const;

/**
 * Écrire une règle récurrente crée, réécrit ou supprime des dépenses : les vues d'argent
 * repartent avec elle. Le contraire n'est pas vrai — supprimer une occurrence à la main
 * ne touche pas la règle.
 */
export const RECURRING_ROOTS = [...MONEY_ROOTS, 'recurringExpenses'] as const;

/**
 * Racines du module de production. Toute écriture les invalide toutes : les cartes de
 * la file d'attente portent les compteurs de produits et de sponsos, l'aperçu porte les
 * alertes, et un seul changement de statut peut faire bouger les trois.
 */
export const PRODUCTION_ROOTS = [
  'productions',
  'productionOverview',
  'productionSlots',
  'productionTodos',
  'productionTime',
  'runningTimer',
  'products',
  'sponsorships',
  // Cocher une tâche la retire de la pile du planning (`ManageTodos`) : la grille et la
  // pile doivent repartir avec la file, sinon elles proposeraient encore de caler du
  // travail déjà fait.
  'planningBoard',
  'planningItems',
] as const;

/**
 * Écrire un produit ou une sponso crée, met à jour ou supprime un revenu : les vues
 * d'argent doivent repartir en même temps que celles de production.
 */
export const PARTNER_ROOTS = [...PRODUCTION_ROOTS, ...MONEY_ROOTS, 'brandStats'] as const;

/**
 * Racines du planning — le module **et** celui de production.
 *
 * Approuver un créneau enregistre une session de travail et peut cocher une tâche :
 * l'avancement de la file d'attente et le compteur de temps de la fiche bougent en même
 * temps que la grille. Ne rafraîchir que le planning laisserait la file annoncer un
 * travail déjà fait.
 *
 * `calendars` n'en fait **pas** partie : la liste des calendriers de l'instance ne
 * dépend d'aucune écriture de notre côté, et la relire à chaque approbation ferait un
 * aller-retour réseau vers la domotique pour rien.
 */
export const PLANNING_ROOTS = [...PRODUCTION_ROOTS, 'planningSettings', 'workHours'] as const;

/**
 * Racines d'Instagram.
 *
 * Le module ne croise aucun autre : ses données vivent dans leurs propres tables, et
 * l'argent continue de se rattacher aux chaînes YouTube. Une collecte touche en revanche
 * les comptes, les séries, les stories et les publications d'un coup — d'où deux racines
 * seulement, invalidées ensemble.
 */
export const INSTAGRAM_ROOTS = ['instagramOverview', 'instagramAccounts'] as const;

/**
 * Racines des commentaires.
 *
 * Le module ne croise aucun autre : un commentaire trié ne touche ni l'argent, ni la
 * file de production, ni les alertes. Les listes et les compteurs, en revanche, bougent
 * toujours ensemble — trier fait sortir la ligne d'un onglet et entrer dans un autre.
 */
export const COMMENT_ROOTS = ['comments', 'commentCounts'] as const;

/**
 * Racines du suivi administratif. Le référentiel part avec l'aperçu : changer un jour
 * limite déplace l'échéance sur tous les mois déjà affichés, et cocher une case retire
 * une alerte du dashboard.
 */
export const LEGAL_ROOTS = ['legalOverview', 'legalObligations'] as const;

/**
 * Racines des référentiels du script : gabarits et angles de vue.
 *
 * Elles ne croisent **aucune** autre, et c'est la contrepartie assumée du choix de tout
 * copier plutôt que de tout référencer : un gabarit inséré vit sa vie dans le script, un
 * angle posé y laisse une copie de son libellé et de sa couleur. Renommer un angle ne
 * réécrit donc aucun script — et rien d'autre n'a besoin de repartir.
 */
export const SCRIPT_ROOTS = ['scriptPresets', 'shotAngles', 'productionShotAngles'] as const;
