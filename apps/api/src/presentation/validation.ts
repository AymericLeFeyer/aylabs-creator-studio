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

export const createProductionStepSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire').max(60),
  color: hexColor,
  sortOrder: z.number().int().optional(),
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

export const updateProductionSlotSchema = createProductionSlotSchema.partial();

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
