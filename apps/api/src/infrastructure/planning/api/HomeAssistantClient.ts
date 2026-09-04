import type {
  CalendarEvent,
  CalendarRef,
} from '../../../domain/planning/entities/CalendarEvent.ts';
import type { IsoDate } from '../../../shared/dates.ts';
import { upstream } from '../../../shared/errors.ts';

/**
 * L'agenda, vu à travers Home Assistant.
 *
 * Pourquoi Home Assistant plutôt qu'un OAuth Google de plus : l'instance porte déjà les
 * calendriers de son propriétaire — Google, CalDAV, iCloud, peu importe — et sait les
 * exposer derrière un **jeton d'accès longue durée**. Refaire un consentement Google ici
 * demanderait un second client OAuth, un second écran de consentement et un second
 * refresh token à garder vivant, pour lire ce que Home Assistant lit déjà.
 *
 * **Ce que l'API REST de Home Assistant permet, et ce qu'elle ne permet pas.** On peut
 * lister les calendriers, lire leurs événements, et en **créer** un
 * (`calendar.create_event`). On ne peut ni en **modifier** ni en **supprimer** : le core
 * n'expose aucun service pour ça. C'est cette limite qui décide de toute la mécanique du
 * planning — les suggestions vivent dans l'outil, où elles se déplacent et se
 * suppriment librement, et **seul un créneau approuvé part dans l'agenda**, précisément
 * parce qu'il ne bougera plus jamais. Pousser les suggestions laisserait au premier
 * replan une traînée d'événements fantômes impossibles à retirer.
 *
 * Les heures sont lues **textuellement** dans la chaîne renvoyée
 * (`2026-09-04T14:00:00+02:00` donne 14 h 00) et écrites sans décalage. Passer par un
 * `Date` recomposerait l'heure dans le fuseau du serveur — UTC dans un conteneur — et
 * décalerait toute la journée de deux heures en été.
 */

interface HaCalendarRow {
  entity_id: string;
  name?: string;
}

interface HaEventRow {
  uid?: string;
  summary?: string;
  start: { dateTime?: string; date?: string } | string;
  end: { dateTime?: string; date?: string } | string;
}

/** `2026-09-04T14:30:00+02:00` → `{ date: '2026-09-04', minutes: 870 }`. */
const parseLocal = (value: string): { date: IsoDate; minutes: number | null } => {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value);
  if (!match) return { date: value.slice(0, 10), minutes: null };
  const [, date, hours, minutes] = match;
  if (hours === undefined || minutes === undefined) return { date: date!, minutes: null };
  return { date: date!, minutes: Number(hours) * 60 + Number(minutes) };
};

const endpointValue = (side: HaEventRow['start']): string => {
  if (typeof side === 'string') return side;
  return side.dateTime ?? side.date ?? '';
};

export class HomeAssistantClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
        // Une instance injoignable ne doit pas faire attendre l'écran de planning :
        // mieux vaut une grille sans occupations qu'une page qui ne s'affiche pas.
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw upstream(
        `Home Assistant injoignable : ${error instanceof Error ? error.message : 'erreur réseau'}`,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw upstream('Jeton Home Assistant refusé. Régénère un jeton d’accès longue durée.');
    }
    if (!response.ok) {
      throw upstream(`Home Assistant a répondu ${response.status}`);
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  /** Les entités calendrier de l'instance, pour le sélecteur des réglages. */
  async listCalendars(): Promise<CalendarRef[]> {
    const rows = await this.call<HaCalendarRow[]>('/api/calendars');
    return (rows ?? [])
      .map((row) => ({ id: row.entity_id, name: row.name ?? row.entity_id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  /**
   * Les événements d'un calendrier sur une fenêtre.
   *
   * `to` est **exclusif** côté Home Assistant : on demande le lendemain du dernier jour
   * voulu, sinon la dernière journée du planning reviendrait toujours vide.
   */
  async listEvents(
    calendarId: string,
    from: IsoDate,
    toExclusive: IsoDate,
  ): Promise<CalendarEvent[]> {
    const rows = await this.call<HaEventRow[]>(
      `/api/calendars/${encodeURIComponent(calendarId)}` +
        `?start=${from}T00:00:00&end=${toExclusive}T00:00:00`,
    );

    const events: CalendarEvent[] = [];
    for (const row of rows ?? []) {
      const start = parseLocal(endpointValue(row.start));
      const end = parseLocal(endpointValue(row.end));
      const allDay = start.minutes === null;

      events.push({
        uid: row.uid ?? `${calendarId}:${start.date}:${start.minutes ?? 'all'}`,
        calendarId,
        summary: row.summary ?? '(sans titre)',
        date: start.date,
        start: start.minutes,
        // Un événement qui déborde sur le lendemain occupe la fin de sa journée : le
        // tronquer à minuit vaut mieux que de le déclarer terminé avant d'avoir commencé.
        end: allDay ? null : end.date === start.date ? end.minutes : 24 * 60,
        allDay,
      });
    }
    return events;
  }

  /**
   * Crée l'événement d'un créneau approuvé.
   *
   * Les heures partent **sans décalage** (`2026-09-04 14:00:00`) : Home Assistant les
   * interprète dans son propre fuseau, qui est celui de l'agenda affiché. C'est
   * exactement le symétrique de la lecture.
   *
   * L'API ne renvoie pas d'identifiant d'événement : on retient la date et l'heure comme
   * trace de publication, ce qui suffit à ne jamais republier deux fois le même créneau.
   */
  async createEvent(input: {
    calendarId: string;
    summary: string;
    description?: string;
    date: IsoDate;
    startTime: string;
    endTime: string;
  }): Promise<string> {
    await this.call<unknown>('/api/services/calendar/create_event', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: input.calendarId,
        summary: input.summary,
        description: input.description ?? '',
        start_date_time: `${input.date} ${input.startTime}:00`,
        end_date_time: `${input.date} ${input.endTime}:00`,
      }),
    });

    return `${input.calendarId}:${input.date}T${input.startTime}`;
  }
}
