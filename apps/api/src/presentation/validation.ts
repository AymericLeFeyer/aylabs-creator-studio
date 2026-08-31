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
