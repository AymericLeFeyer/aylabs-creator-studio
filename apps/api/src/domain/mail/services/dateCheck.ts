/**
 * « Vérifier les dates » : ce que l'IA doit rendre, et sa relecture.
 *
 * La réponse est contrainte par un schéma JSON (structured outputs), mais elle est quand
 * même **revalidée ici** : ce sont des dates qui vont devenir des tâches, et une date mal
 * formée posée dans Todo ne se verrait qu'au moment où elle aurait dû servir.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

export const DATE_CHECK_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'urgent', 'deadlines', 'incoherences'],
  properties: {
    summary: { type: 'string' },
    urgent: { type: 'boolean' },
    deadlines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'dueDate', 'urgent', 'startDate', 'duration', 'quote'],
        properties: {
          title: { type: 'string' },
          dueDate: { type: 'string', format: 'date' },
          urgent: { type: 'boolean' },
          startDate: nullable({ type: 'string', format: 'date' }),
          duration: nullable({ type: 'integer', enum: [15, 30, 60] }),
          quote: { type: 'string' },
        },
      },
    },
    incoherences: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['message', 'field', 'suggestedDate'],
        properties: {
          message: { type: 'string' },
          field: nullable({ type: 'string', enum: ['plannedDate', 'startDate'] }),
          suggestedDate: nullable({ type: 'string', format: 'date' }),
        },
      },
    },
  },
};

export interface AiDeadline {
  title: string;
  dueDate: string;
  urgent: boolean;
  startDate: string | null;
  duration: 15 | 30 | 60 | null;
  quote: string;
}

export interface AiIncoherence {
  message: string;
  field: 'plannedDate' | 'startDate' | null;
  suggestedDate: string | null;
}

export interface AiDateCheck {
  summary: string;
  urgent: boolean;
  deadlines: AiDeadline[];
  incoherences: AiIncoherence[];
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const date = (value: unknown): string | null =>
  typeof value === 'string' && DATE.test(value) ? value : null;

/** Relit la réponse. Une échéance sans titre ou sans date valide est écartée, pas devinée. */
export const parseDateCheck = (raw: string): AiDateCheck => {
  let json: unknown;
  try {
    json = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, ''));
  } catch {
    throw new Error('Réponse de l’IA illisible.');
  }
  const root = record(json);
  const deadlines = (Array.isArray(root.deadlines) ? root.deadlines : []).flatMap((entry) => {
    const item = record(entry);
    const title = text(item.title);
    const dueDate = date(item.dueDate);
    if (!title || !dueDate) return [];
    const duration = [15, 30, 60].includes(item.duration as number)
      ? (item.duration as 15 | 30 | 60)
      : null;
    return [
      {
        title: title.slice(0, 200),
        dueDate,
        urgent: item.urgent === true,
        startDate: date(item.startDate),
        duration,
        quote: text(item.quote).slice(0, 500),
      },
    ];
  });
  const incoherences = (Array.isArray(root.incoherences) ? root.incoherences : []).flatMap(
    (entry) => {
      const item = record(entry);
      const message = text(item.message);
      if (!message) return [];
      const field: AiIncoherence['field'] =
        item.field === 'plannedDate' || item.field === 'startDate' ? item.field : null;
      return [{ message, field, suggestedDate: field ? date(item.suggestedDate) : null }];
    },
  );
  return { summary: text(root.summary), urgent: root.urgent === true, deadlines, incoherences };
};

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** « mercredi 2026-10-29 » : le jour de la semaine aide l'IA à résoudre « mercredi prochain ». */
export const describeDay = (isoDate: string): string =>
  `${WEEKDAYS[new Date(`${isoDate}T12:00:00Z`).getUTCDay()]} ${isoDate}`;
