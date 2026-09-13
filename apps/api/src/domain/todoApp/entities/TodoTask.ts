import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Le domaine `todoApp` : les tâches de l'application Todo, affichées dans le planning.
 *
 * Todo reste **la source de vérité** de ce qui est à faire : le studio ne copie aucune
 * tâche, il lit l'API à chaque ouverture du planning et y renvoie les coches. La seule
 * chose qu'il possède est l'**heure** donnée à une tâche (`TodoPlacement`) — l'app Todo ne
 * connaît qu'un jour et une durée, et l'heure n'a de sens que dans une grille horaire.
 */

export interface TodoTag {
  name: string;
  slug: string;
  color: string;
}

/** Une tâche telle que l'API de Todo la rend, réduite aux champs que le planning lit. */
export interface TodoTask {
  id: string;
  title: string;
  /** `null` = sans échéance (Inbox) : une telle tâche n'a pas de jour où s'afficher. */
  dueDate: IsoDate | null;
  /** 15, 30 ou 60 — l'app n'en connaît pas d'autre. `null` = pas estimée. */
  duration: number | null;
  completedAt: string | null;
  tags: TodoTag[];
}

/**
 * L'heure donnée à une tâche dans le planning.
 *
 * `date` est **toujours égale à l'échéance** de la tâche dans Todo : poser une tâche sur un
 * autre jour change son échéance là-bas. Un placement dont la date ne correspond plus —
 * la tâche a été reportée depuis l'app — est périmé et nettoyé à la lecture suivante.
 */
export interface TodoPlacement {
  taskId: string;
  date: IsoDate;
  startTime: string;
  /** Durée du bloc. Todo ne propose que 15/30/60 : on allonge ici sans rien écrire là-bas. */
  minutes: number;
}

/** Ce que la grille affiche d'une tâche, rangée sous le jour où elle s'affiche. */
export interface TodoTaskView {
  id: string;
  title: string;
  /** L'échéance réelle dans Todo — pas forcément le jour où la tâche s'affiche. */
  dueDate: IsoDate;
  duration: number | null;
  done: boolean;
  /**
   * Ouverte et due avant aujourd'hui. Elle s'affiche alors **sous aujourd'hui**, comme
   * dans l'app Todo : c'est là qu'elle attend d'être faite.
   */
  overdue: boolean;
  tags: TodoTag[];
  /** `null` = « à caler » : la tâche est sous le jour, sans heure. */
  placement: { startTime: string; minutes: number } | null;
}

/** Durée d'un bloc quand Todo n'en donne pas. Même valeur côté front. */
export const DEFAULT_TODO_MINUTES = 30;

/**
 * L'état de la connexion, pour l'écran de réglages. **La clé n'en sort jamais** : seule sa
 * provenance est exposée, comme pour les secrets de l'export.
 */
export interface TodoConnectionView {
  baseUrl: string | null;
  /** L'adresse vient de `TODO_BASE_URL` : elle ne se change pas depuis l'écran. */
  baseUrlFromEnv: boolean;
  /** `unreadable` = chiffrée avec une autre `SECRETS_KEY`, à ressaisir. */
  keySource: 'env' | 'app' | 'unreadable' | null;
  /** Slugs de tags filtrés. Vide = toutes les tâches. */
  tags: string[];
  /** Sans `SECRETS_KEY`, la clé ne peut pas être enregistrée depuis l'écran. */
  secretsKeyConfigured: boolean;
}
