import { z } from 'zod';
import { addDays, today } from '../shared/dates.ts';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur attendue au format #rrggbb')
  .optional();

/** Un montant en euros côté client, converti en centimes entiers côté serveur. */
const amount = z
  .number()
  .finite()
  .transform((value) => Math.round(value * 100));

export const createChannelSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(120),
  mode: z.enum(['public', 'oauth', 'manual']),
  externalId: z.string().trim().min(1).nullable().optional(),
  handle: z.string().trim().nullable().optional(),
  color: hexColor,
  refreshToken: z.string().trim().nullable().optional(),
});

export const updateChannelSchema = createChannelSchema.partial().extend({
  isArchived: z.boolean().optional(),
});

export const resolveChannelSchema = z.object({
  query: z.string().trim().min(1, 'Indique un @handle, une URL ou un identifiant de chaîne'),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(60),
  nature: z.enum(['cash', 'in_kind']),
  /** Côté du grand livre où la catégorie a le droit d'exister. */
  scope: z.enum(['revenue', 'expense', 'both']).default('revenue'),
  color: hexColor,
  sortOrder: z.number().int().optional(),
});

export const updateCategorySchema = createCategorySchema.partial().extend({
  isArchived: z.boolean().optional(),
});

/** Filtres de `GET /api/categories` (query string : tout arrive en texte). */
export const categoryQuerySchema = z.object({
  includeArchived: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  scope: z.enum(['revenue', 'expense', 'both']).optional(),
});

export const createRevenueSchema = z.object({
  channelId: z.string().nullable().optional(),
  categoryId: z.string().min(1, 'La catégorie est obligatoire'),
  /** Rattachement facultatif à une sortie de vidéo. */
  videoId: z.string().nullable().optional(),
  /** Plateforme d'affiliation qui a rapporté ce revenu. Facultatif. */
  platformId: z.string().nullable().optional(),
  date: isoDate,
  amount,
  label: z.string().trim().min(1, 'Le libellé est obligatoire').max(200),
  notes: z.string().trim().nullable().optional(),
});

export const updateRevenueSchema = createRevenueSchema.partial();

export const createExpenseSchema = z.object({
  channelId: z.string().nullable().optional(),
  categoryId: z.string().min(1, 'La catégorie est obligatoire'),
  videoId: z.string().nullable().optional(),
  date: isoDate,
  amount,
  label: z.string().trim().min(1, 'Le libellé est obligatoire').max(200),
  notes: z.string().trim().nullable().optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const manualMetricSchema = z.object({
  date: isoDate,
  views: z.number().int().min(0).default(0),
  watchMinutes: z.number().min(0).default(0),
  subscribersGained: z.number().int().min(0).default(0),
  subscribersLost: z.number().int().min(0).default(0),
  likes: z.number().int().min(0).default(0),
  comments: z.number().int().min(0).default(0),
  shares: z.number().int().min(0).default(0),
  estimatedRevenue: z.number().min(0).default(0),
});

export const manualSnapshotSchema = z.object({
  date: isoDate,
  subscribers: z.number().int().min(0),
  totalViews: z.number().int().min(0).default(0),
  totalVideos: z.number().int().min(0).default(0),
});

/**
 * Paramètres de requête du dashboard.
 * `channelIds` accepte une liste séparée par des virgules ; vide = vue cumulée.
 */
export const analyticsQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  granularity: z.enum(['day', 'week', 'month']).default('day'),
  channelIds: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  includeUnassigned: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
});

/** Applique la période par défaut (30 derniers jours) et garantit `from <= to`. */
export const resolveRange = (from?: string, to?: string): { from: string; to: string } => {
  const end = to ?? today();
  const start = from ?? addDays(end, -29);
  return start <= end ? { from: start, to: end } : { from: end, to: start };
};

/**
 * Filtres de `GET /api/videos`. La période est facultative : le sélecteur des
 * formulaires doit pouvoir proposer des vidéos plus anciennes que la période affichée.
 */
export const videoQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  channelIds: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** Filtre optionnel sur une période, pour les listes de revenus et de dépenses. */
export const rangeQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  channelIds: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
});

// ---------------------------------------------------------------------------
// Module de production
// ---------------------------------------------------------------------------

/** Liste séparée par des virgules dans la query string ; vide = pas de filtre. */
const csvList = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

/** Un montant facultatif en euros, converti en centimes comme les revenus. */
const optionalAmount = z
  .number()
  .finite()
  .transform((value) => Math.round(value * 100))
  .optional();

const optionalIsoDate = isoDate.nullable().optional();

/** Horaire d'un créneau, ou `null` : un créneau sans heure reste un créneau. */
const time = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'Heure attendue au format HH:MM')
  .nullable()
  .optional();

export const createBrandSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(120),
  website: z.string().trim().nullable().optional(),
  contactName: z.string().trim().nullable().optional(),
  contactEmail: z.string().trim().nullable().optional(),
  color: hexColor,
  notes: z.string().trim().nullable().optional(),
});

export const updateBrandSchema = createBrandSchema.partial().extend({
  isArchived: z.boolean().optional(),
});

export const brandQuerySchema = z.object({
  includeArchived: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
});

/** Bornes des classements du dashboard : mêmes paramètres que `/api/analytics`. */
export const brandStatsQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  channelIds: csvList,
});

/** Durée moyenne d'un travail, en minutes. `null` = « je ne sais pas », et c'est valide. */
const durationMinutes = z
  .number()
  .int()
  .min(5, 'Au moins 5 minutes')
  .max(24 * 60)
  .nullable()
  .optional();

export const createProductionStepSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(60),
  color: hexColor,
  sortOrder: z.number().int().optional(),
  defaultMinutes: durationMinutes,
});

export const updateProductionStepSchema = createProductionStepSchema.partial().extend({
  isArchived: z.boolean().optional(),
});

export const createProductionSchema = z.object({
  title: z.string().trim().min(1, 'Le titre est obligatoire').max(200),
  channelId: z.string().nullable().optional(),
  videoId: z.string().nullable().optional(),
  status: z.enum(['idea', 'in_progress', 'paused', 'done']).optional(),
  pausedReason: z.string().trim().nullable().optional(),
  startDate: optionalIsoDate,
  plannedDate: optionalIsoDate,
  script: z.string().optional(),
  notes: z.string().nullable().optional(),
});

export const updateProductionSchema = createProductionSchema.partial();

export const productionQuerySchema = z.object({
  statuses: csvList,
  channelIds: csvList,
  from: isoDate.optional(),
  to: isoDate.optional(),
  search: z.string().trim().optional(),
});

/** L'ordre complet de la file, dans l'ordre reçu : le rang est l'index. */
export const reorderProductionsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Aucune production à réordonner'),
});

export const publishProductionSchema = z.object({
  videoId: z.string().min(1, 'Choisis la sortie correspondante'),
});

export const createProductionSlotSchema = z.object({
  stepId: z.string().nullable().optional(),
  date: isoDate,
  startTime: time,
  endTime: time,
  label: z.string().trim().max(200).optional(),
  done: z.boolean().optional(),
  notes: z.string().trim().nullable().optional(),
});

/**
 * `origin` n'est modifiable qu'ici, pas à la création.
 *
 * Déplacer un créneau à la main le fait passer en `manual`, et le rend donc **immobile**
 * pour le moteur de placement : le poser soi-même est une décision, et le prochain
 * repositionnement n'a pas à la défaire. Sans ce champ, le glisser-déposer serait
 * silencieusement annulé au replacement suivant.
 */
export const updateProductionSlotSchema = createProductionSlotSchema.partial().extend({
  origin: z.enum(['manual', 'planner']).optional(),
});

/** Création depuis le router des créneaux : la production fait partie du corps. */
export const createSlotBodySchema = createProductionSlotSchema.extend({
  productionId: z.string().min(1, 'La production est obligatoire'),
});

export const slotQuerySchema = z.object({
  productionIds: csvList,
  from: isoDate.optional(),
  to: isoDate.optional(),
  includeDone: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(200),
  brandId: z.string().nullable().optional(),
  productionId: z.string().nullable().optional(),
  /** Sortie déjà publiée, quand elle n'a pas de fiche de production. */
  videoId: z.string().nullable().optional(),
  /** Sponso dont ce produit fait partie. Facultatif : beaucoup arrivent seuls. */
  sponsorshipId: z.string().nullable().optional(),
  channelId: z.string().nullable().optional(),
  url: z.string().trim().nullable().optional(),
  /** Valeur en euros, convertie en centimes. C'est elle qui devient le revenu en nature. */
  value: optionalAmount,
  status: z
    .enum(['discussion', 'confirmed', 'shipped', 'received', 'returned', 'cancelled'])
    .optional(),
  requestedAt: optionalIsoDate,
  deadline: optionalIsoDate,
  receivedAt: optionalIsoDate,
  notes: z.string().trim().nullable().optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const productQuerySchema = z.object({
  statuses: csvList,
  brandIds: csvList,
  productionIds: csvList,
  sponsorshipIds: csvList,
  channelIds: csvList,
});

export const createSponsorshipSchema = z.object({
  label: z.string().trim().min(1, 'Le libellé est obligatoire').max(200),
  brandId: z.string().nullable().optional(),
  productionId: z.string().nullable().optional(),
  /** Sortie déjà publiée, quand elle n'a pas de fiche de production. */
  videoId: z.string().nullable().optional(),
  channelId: z.string().nullable().optional(),
  /** Montant en euros, converti en centimes. Devient le revenu cash une fois payé. */
  amount: optionalAmount,
  status: z.enum(['discussion', 'todo', 'in_progress', 'paid', 'cancelled']).optional(),
  deadline: optionalIsoDate,
  paidAt: optionalIsoDate,
  /** Script de l'intégration, en markdown. Édité depuis son propre écran, pas la modale. */
  script: z.string().optional(),
  notes: z.string().trim().nullable().optional(),
});

export const updateSponsorshipSchema = createSponsorshipSchema.partial();

export const sponsorshipQuerySchema = z.object({
  statuses: csvList,
  brandIds: csvList,
  productionIds: csvList,
  channelIds: csvList,
});

/** Un plan à filmer exigé par la marque : un intitulé, et rien d'autre à la création. */
export const createRequirementSchema = z.object({
  label: z.string().trim().min(1, "L'intitulé est obligatoire").max(300),
});

export const updateRequirementSchema = z.object({
  label: z.string().trim().min(1).max(300).optional(),
  done: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const createIdeaSchema = z.object({
  text: z.string().trim().min(1, "L'idée ne peut pas être vide").max(500),
});

export const updateIdeaSchema = createIdeaSchema.partial();

/** Un mois, maille du tableau légal. */
const isoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mois attendu au format AAAA-MM');

/** Champ texte facultatif d'une fiche : la chaîne vide vaut « pas renseigné ». */
const optionalText = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .optional()
  .transform((value) => (value === '' ? null : value));

export const updateCompanySchema = z.object({
  name: z.string().trim().max(200).optional(),
  legalForm: optionalText,
  siret: optionalText,
  vatNumber: optionalText,
  address: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value)),
  /** Décide du premier mois du tableau des obligations. */
  foundedOn: optionalIsoDate,
  notes: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value)),
});

export const createLegalObligationSchema = z.object({
  label: z.string().trim().min(1, 'Le libellé est obligatoire').max(200),
  /** Jour limite dans le mois. `null` = pas d'échéance : le mois entier fait foi. */
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  notes: optionalText,
  sortOrder: z.number().int().optional(),
});

export const updateLegalObligationSchema = createLegalObligationSchema.partial().extend({
  isArchived: z.boolean().optional(),
});

export const legalMonthParamSchema = isoMonth;

/**
 * Un favori de l'écran Légal.
 *
 * `url` est validée comme une **URL absolue** : un chemin relatif ouvrirait une route de
 * l'application au lieu du site visé, et l'erreur ne se verrait qu'au clic.
 */
export const createLegalBookmarkSchema = z.object({
  label: z.string().trim().min(1, 'Le nom est obligatoire').max(80),
  url: z.string().trim().url('Adresse attendue, par exemple https://www.urssaf.fr').max(500),
  description: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value)),
  /** Vignette. Vide = favicon du site cible, puis initiale sur fond coloré. */
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value)),
  color: hexColor,
  sortOrder: z.number().int().optional(),
});

export const updateLegalBookmarkSchema = createLegalBookmarkSchema.partial().extend({
  isArchived: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Tâches d'étape, suivi du temps, dépenses récurrentes
// ---------------------------------------------------------------------------

/** Une tâche du référentiel : elle appartient à une étape et porte un intitulé. */
export const createStepTodoSchema = z.object({
  stepId: z.string().min(1, "L'étape est obligatoire"),
  label: z.string().trim().min(1, "L'intitulé est obligatoire").max(200),
  sortOrder: z.number().int().optional(),
  defaultMinutes: durationMinutes,
});

export const updateStepTodoSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  sortOrder: z.number().int().optional(),
  isArchived: z.boolean().optional(),
  defaultMinutes: durationMinutes,
});

/** Une tâche ponctuelle, posée sur une seule vidéo. */
export const createProductionTodoSchema = z.object({
  stepId: z.string().nullable().optional(),
  label: z.string().trim().min(1, "L'intitulé est obligatoire").max(200),
  defaultMinutes: durationMinutes,
});

export const toggleTodoSchema = z.object({
  checked: z.boolean(),
});

/** Horodatage ISO complet : le chronomètre travaille à la minute, pas à la journée. */
const isoInstant = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Horodatage invalide');

export const startTimerSchema = z.object({
  productionId: z.string().min(1, 'La vidéo est obligatoire'),
  /** Sur quoi ce temps est passé. Facultatif : on peut chronométrer sans qualifier. */
  stepId: z.string().nullable().optional(),
  /** La sous-étape, plus fine que l'étape. Facultative pour la même raison. */
  todoId: z.string().nullable().optional(),
});

/** Saisie manuelle : on donne un début et une durée, jamais une fin. */
export const createTimeEntrySchema = z.object({
  productionId: z.string().min(1, 'La vidéo est obligatoire'),
  stepId: z.string().nullable().optional(),
  todoId: z.string().nullable().optional(),
  startedAt: isoInstant,
  minutes: z
    .number()
    .int()
    .min(1, 'Au moins une minute')
    .max(24 * 60),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const updateTimeEntrySchema = z.object({
  stepId: z.string().nullable().optional(),
  todoId: z.string().nullable().optional(),
  startedAt: isoInstant.optional(),
  minutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const timeEntryQuerySchema = z.object({
  productionIds: csvList,
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const createRecurringExpenseSchema = z.object({
  channelId: z.string().nullable().optional(),
  categoryId: z.string().min(1, 'La catégorie est obligatoire'),
  label: z.string().trim().min(1, 'Le libellé est obligatoire').max(200),
  /** Montant en euros, converti en centimes comme toute écriture d'argent. */
  amount,
  /**
   * Périodicité en mois : 1 mensuel, 3 trimestriel, 12 annuel, 24 tous les deux ans.
   * Un nombre plutôt qu'une énumération — toute périodicité exprimable en mois existe
   * déjà, sans migration ni valeur à ajouter.
   */
  intervalMonths: z.number().int().min(1).max(120),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  startDate: isoDate,
  endDate: optionalIsoDate,
  notes: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const updateRecurringExpenseSchema = createRecurringExpenseSchema.partial();

/**
 * Une plateforme d'affiliation. `brandIds` remplace **entièrement** la liste des marques
 * quand il est fourni : le formulaire envoie l'état complet des cases cochées, et une
 * fusion rendrait impossible le retrait d'une marque.
 */
export const createAffiliatePlatformSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(120),
  description: optionalText,
  url: z
    .string()
    .trim()
    .url('Adresse attendue, par exemple https://partenaires.amazon.fr')
    .max(500)
    .nullable()
    .optional(),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value)),
  color: hexColor,
  notes: optionalText,
  sortOrder: z.number().int().optional(),
  brandIds: z.array(z.string().min(1)).optional(),
});

export const updateAffiliatePlatformSchema = createAffiliatePlatformSchema.partial().extend({
  isArchived: z.boolean().optional(),
});

/** Bornes des gains par plateforme : mêmes paramètres que les classements de marques. */
export const platformQuerySchema = z.object({
  includeArchived: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/** `HH:MM` sur 24 h. Les créneaux et les horaires de travail n'ont pas d'autre format. */
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure attendue au format HH:MM');

/**
 * Une plage travaillable. `weekday` va de 0 (lundi) à 6 (dimanche), même convention que
 * le découpage hebdomadaire des séries.
 */
export const workHoursSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: clockTime,
  endTime: clockTime,
});

/**
 * La grille complète de la semaine, envoyée d'un bloc.
 * Un remplacement total et non des différences : sans ça, retirer une plage demanderait
 * un identifiant que le formulaire n'a aucune raison de connaître.
 */
export const replaceWorkHoursSchema = z.object({
  ranges: z.array(workHoursSchema).max(50),
});

export const planningSettingsSchema = z.object({
  /** Absolue et sans slash final. Le front complète le `https://` manquant. */
  calendarBaseUrl: z.string().trim().url('Adresse invalide (https://…)').nullable().optional(),
  /** `""` efface le jeton, absent le conserve — même convention que `refreshToken`. */
  calendarToken: z.string().nullable().optional(),
  targetCalendarId: z.string().trim().nullable().optional(),
  busyCalendarIds: z.array(z.string().trim().min(1)).max(20).optional(),
  slotGranularityMinutes: z.number().int().min(5).max(60).optional(),
  minBlockMinutes: z
    .number()
    .int()
    .min(5)
    .max(8 * 60)
    .optional(),
  maxBlockMinutes: z
    .number()
    .int()
    .min(15)
    .max(12 * 60)
    .optional(),
  breakMinutes: z.number().int().min(0).max(120).optional(),
  horizonDays: z.number().int().min(1).max(120).optional(),
  pushToCalendar: z.boolean().optional(),
});

/** Fenêtre affichée par l'écran de planning. */
export const planningBoardQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
});

/**
 * L'heure locale du navigateur, en minutes depuis minuit.
 *
 * Elle vient du client et non de l'horloge du serveur : l'API tourne en UTC dans un
 * conteneur, et s'y fier proposerait un créneau à 9 h alors qu'il est midi.
 */
const nowMinutes = z
  .number()
  .int()
  .min(0)
  .max(24 * 60)
  .optional();

export const planTargetsSchema = z.object({
  productionId: z.string().min(1, 'La vidéo est obligatoire'),
  stepIds: z.array(z.string().min(1)).default([]),
  todoIds: z.array(z.string().min(1)).default([]),
  from: isoDate.optional(),
  nowMinutes,
});

export const replanSchema = z.object({
  from: isoDate.optional(),
  /** Ne réorganiser qu'un jour : le bouton d'une colonne du planning. */
  onlyDate: isoDate.optional(),
  nowMinutes,
});

export const reorderPlanningItemsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Aucune ligne à réordonner'),
  nowMinutes,
});

/**
 * L'approbation d'un créneau. `finished` est **obligatoire** : c'est la question qu'on
 * pose à l'utilisateur, et une valeur par défaut y répondrait à sa place.
 */
/**
 * Transformer une session de travail en créneau.
 *
 * Le jour et l'heure sont **obligatoires et fournis par le client** : `startedAt` est un
 * horodatage UTC, et l'API tourne en UTC dans un conteneur — les recalculer ici poserait
 * le créneau deux heures trop tôt en été. Même règle que `nowMinutes`.
 */
export const slotFromTimeEntrySchema = z.object({
  date: isoDate,
  startTime: clockTime,
});

export const approveSlotSchema = z.object({
  finished: z.boolean(),
  /** Temps réellement passé, si différent de la durée prévue. */
  minutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  from: isoDate.optional(),
  nowMinutes,
});
