/**
 * Les réglages du planning : où poser les créneaux, et à quel rythme.
 *
 * Ligne unique en base, comme `company`. L'agenda est branché par une **URL + un
 * jeton** plutôt que par un OAuth de plus : la source visée est une instance Home
 * Assistant, qui porte déjà les calendriers Google de leur propriétaire et sait les
 * exposer derrière un jeton d'accès longue durée. Refaire un consentement Google ici
 * demanderait un second client OAuth pour lire ce que Home Assistant lit déjà.
 */
export interface PlanningSettings {
  /** Base de l'instance Home Assistant, sans slash final (`https://ha.exemple.fr`). */
  calendarBaseUrl: string | null;
  /** Entité calendrier où publier les créneaux approuvés (`calendar.creator_studio`). */
  targetCalendarId: string | null;
  /** Entités lues pour connaître l'occupation réelle de la journée. */
  busyCalendarIds: string[];
  /** Pas de placement, en minutes : les créneaux commencent sur un multiple. */
  slotGranularityMinutes: number;
  /** Un bloc plus court que ça ne vaut pas la peine d'être posé. */
  minBlockMinutes: number;
  /** Au-delà, une tâche longue est découpée en plusieurs séances. */
  maxBlockMinutes: number;
  /** Respiration entre deux blocs consécutifs. */
  breakMinutes: number;
  /** Jusqu'où le moteur a le droit de regarder devant lui. */
  horizonDays: number;
  /** Publier dans l'agenda à l'approbation. Décoché, tout reste dans l'outil. */
  pushToCalendar: boolean;
  updatedAt: string;
}

/**
 * Ce que l'API renvoie : **le jeton ne sort jamais**, remplacé par un booléen.
 * Même règle que `refreshToken` sur les chaînes.
 */
export interface PlanningSettingsView extends PlanningSettings {
  hasToken: boolean;
}

export type PlanningSettingsInput = Partial<
  Omit<PlanningSettings, 'updatedAt'> & {
    /** `""` efface le jeton, absent le conserve — même convention que `refreshToken`. */
    calendarToken: string | null;
  }
>;
