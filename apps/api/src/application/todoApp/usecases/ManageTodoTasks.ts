import type { IsoDate } from '../../../shared/dates.ts';
import { addDays } from '../../../shared/dates.ts';
import { badRequest, conflict } from '../../../shared/errors.ts';
import type { BusyBlock } from '../../../domain/planning/services/scheduler.ts';
import { toMinutes } from '../../../domain/planning/entities/WorkHours.ts';
import type {
  TodoConnectionView,
  TodoPlacement,
  TodoTask,
  TodoTaskView,
} from '../../../domain/todoApp/entities/TodoTask.ts';
import type {
  StoredTodoConnection,
  TodoConnectionRepository,
  TodoPlacementRepository,
  TodoSecretCipher,
  TodoTaskSource,
} from '../../../domain/todoApp/repositories/TodoRepository.ts';

/** Donnée authentifiée du chiffré : recopier la valeur dans un autre champ la rend illisible. */
const KEY_CONTEXT = 'todo:apiKey';

/** Ce que l'environnement fournit. Il l'emporte toujours sur l'écran. */
export interface TodoEnv {
  baseUrl: string | null;
  apiKey: string | null;
}

export interface TodoBoardData {
  byDate: Map<IsoDate, TodoTaskView[]>;
  connected: boolean;
  error: string | null;
}

/**
 * Les tâches de l'app Todo dans le planning.
 *
 * **Todo reste la source de vérité.** Rien n'est copié : les tâches sont relues à chaque
 * ouverture du planning, et cocher ici coche là-bas. Le studio ne possède que l'**heure**
 * donnée à une tâche (`todo_placements`), parce que Todo n'en a pas.
 *
 * Trois règles :
 *
 * 1. **Une tâche en retard s'affiche sous aujourd'hui**, comme dans l'app Todo : sa place
 *    d'origine est passée, c'est aujourd'hui qu'elle attend d'être faite.
 * 2. **Poser une tâche sur un autre jour déplace son échéance dans Todo.** Sans ça, la
 *    tâche serait placée mardi dans le planning et due lundi dans l'app — deux vérités.
 * 3. **Un placement périmé se nettoie à la lecture** : si la tâche a été reportée ou
 *    supprimée depuis l'app, son heure n'a plus d'objet. Seule une lecture réussie
 *    nettoie — une Todo injoignable ne doit rien effacer.
 *
 * Seul ce use case chiffre et déchiffre la clé API, comme `ManageIntegrations`.
 */
export class ManageTodoTasks {
  private readonly placements: TodoPlacementRepository;
  private readonly connection: TodoConnectionRepository;
  private readonly cipher: TodoSecretCipher;
  private readonly env: TodoEnv;
  private readonly makeClient: (baseUrl: string, apiKey: string | null) => TodoTaskSource;

  constructor(
    placements: TodoPlacementRepository,
    connection: TodoConnectionRepository,
    cipher: TodoSecretCipher,
    env: TodoEnv,
    makeClient: (baseUrl: string, apiKey: string | null) => TodoTaskSource,
  ) {
    this.placements = placements;
    this.connection = connection;
    this.cipher = cipher;
    this.env = env;
    this.makeClient = makeClient;
  }

  // --- Connexion ------------------------------------------------------------

  view(): TodoConnectionView {
    const stored = this.connection.get();
    let keySource: TodoConnectionView['keySource'] = null;
    if (this.env.apiKey) keySource = 'env';
    else if (stored.encryptedKey) {
      keySource =
        this.cipher.decrypt(stored.encryptedKey, KEY_CONTEXT) === null ? 'unreadable' : 'app';
    }

    return {
      baseUrl: this.env.baseUrl ?? stored.baseUrl,
      baseUrlFromEnv: this.env.baseUrl !== null,
      keySource,
      tags: stored.tags,
      secretsKeyConfigured: this.cipher.available,
    };
  }

  /**
   * Champ absent = conservé. Un champ couvert par l'environnement est refusé en 409 : la
   * correction faite à l'écran ne marcherait pas, sans raison visible.
   */
  updateConnection(input: {
    baseUrl?: string | null;
    apiKey?: string | null;
    tags?: string[];
  }): void {
    const patch: Partial<StoredTodoConnection> = {};

    if (input.baseUrl !== undefined) {
      if (this.env.baseUrl) {
        throw conflict(
          'L’adresse de Todo vient de TODO_BASE_URL : elle se change dans l’environnement.',
        );
      }
      patch.baseUrl = input.baseUrl ? input.baseUrl.replace(/\/+$/, '') : null;
    }

    if (input.apiKey !== undefined) {
      if (this.env.apiKey) {
        throw conflict(
          'La clé de Todo vient de TODO_API_KEY : elle se change dans l’environnement.',
        );
      }
      // Jamais de clair : sans SECRETS_KEY, `encrypt` refuse en 409.
      patch.encryptedKey = input.apiKey ? this.cipher.encrypt(input.apiKey, KEY_CONTEXT) : null;
    }

    if (input.tags !== undefined) {
      // Todo convertit lui-même les noms en slugs : « Montage Vidéo » et « montage-video »
      // désignent le même tag, on garde ce qui a été tapé.
      patch.tags = input.tags.map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean);
    }

    if (Object.keys(patch).length > 0) this.connection.update(patch);
  }

  private client(): TodoTaskSource | null {
    const stored = this.connection.get();
    const baseUrl = this.env.baseUrl ?? stored.baseUrl;
    if (!baseUrl) return null;

    // La clé est facultative : une instance sans APP_PASSWORD répond sans. Une clé
    // illisible (SECRETS_KEY changée) est traitée comme absente, et Todo le dira en 401.
    const apiKey =
      this.env.apiKey ??
      (stored.encryptedKey ? this.cipher.decrypt(stored.encryptedKey, KEY_CONTEXT) : null);
    return this.makeClient(baseUrl, apiKey);
  }

  private require(): TodoTaskSource {
    const client = this.client();
    if (!client) {
      throw badRequest(
        'Todo n’est pas connecté : renseigne son adresse dans Paramètres → Planning.',
      );
    }
    return client;
  }

  // --- Lecture --------------------------------------------------------------

  /**
   * Les tâches de la période, rangées par jour d'affichage.
   *
   * Deux lectures : les tâches **datées dans la période** (faites comprises, pour qu'une
   * case cochée reste visible barrée), et — seulement si aujourd'hui est à l'écran — les
   * tâches **ouvertes datées d'avant la période**, qui remontent sous aujourd'hui.
   *
   * Une lecture qui échoue ne fait pas échouer le planning : la grille sort sans tâches,
   * avec l'erreur, et **aucun placement n'est nettoyé**.
   */
  async forBoard(from: IsoDate, to: IsoDate, todayDate: IsoDate): Promise<TodoBoardData> {
    const byDate = new Map<IsoDate, TodoTaskView[]>();
    const client = this.client();
    if (!client) return { byDate, connected: false, error: null };

    const { tags } = this.connection.get();
    const showsToday = todayDate >= from && todayDate <= to;

    let inRange: TodoTask[];
    let before: TodoTask[];
    try {
      [inRange, before] = await Promise.all([
        client.listTasks({ status: 'all', from, to, tags }),
        showsToday
          ? client.listTasks({ status: 'open', to: addDays(from, -1), tags })
          : Promise.resolve([]),
      ]);
    } catch (error) {
      return {
        byDate,
        connected: true,
        error: error instanceof Error ? error.message : 'Lecture de Todo impossible',
      };
    }

    // Un placement n'est valable que tant que la tâche est toujours due ce jour-là.
    const placements = new Map(this.placements.findInRange(from, to).map((p) => [p.taskId, p]));
    const valid = new Set(
      inRange.filter((task) => task.dueDate).map((task) => `${task.id}:${task.dueDate}`),
    );
    const stale = [...placements.values()]
      .filter((placement) => !valid.has(`${placement.taskId}:${placement.date}`))
      .map((placement) => placement.taskId);
    if (stale.length > 0) {
      this.placements.deleteMany(stale);
      for (const id of stale) placements.delete(id);
    }

    const seen = new Set<string>();
    for (const task of [...inRange, ...before]) {
      if (!task.dueDate || seen.has(task.id)) continue;
      seen.add(task.id);

      const done = task.completedAt !== null;
      const overdue = !done && task.dueDate < todayDate;
      const date = overdue && showsToday ? todayDate : task.dueDate;
      if (date < from || date > to) continue;

      // Une tâche en retard remontée sous aujourd'hui n'a pas d'heure aujourd'hui : celle
      // qu'elle avait tombait sur son jour d'origine, qui est passé.
      const placement = placements.get(task.id);
      const list = byDate.get(date) ?? [];
      list.push({
        id: task.id,
        title: task.title,
        dueDate: task.dueDate,
        duration: task.duration,
        done,
        overdue,
        tags: task.tags,
        placement:
          placement && placement.date === date
            ? { startTime: placement.startTime, minutes: placement.minutes }
            : null,
      });
      byDate.set(date, list);
    }

    return { byDate, connected: true, error: null };
  }

  /**
   * Les heures posées sur des tâches, vues comme des occupations.
   *
   * Lues en **base locale** et jamais dans Todo : un replan ne doit pas dépendre d'une
   * autre machine. Une tâche déjà faite occupe toujours son heure — le temps a bien été
   * pris.
   */
  busyBlocks(from: IsoDate, to: IsoDate): BusyBlock[] {
    return this.placements.findInRange(from, to).map((placement) => {
      const start = toMinutes(placement.startTime);
      return { date: placement.date, start, end: Math.min(24 * 60, start + placement.minutes) };
    });
  }

  // --- Écritures ------------------------------------------------------------

  async setDone(id: string, done: boolean): Promise<void> {
    const client = this.require();
    if (done) await client.complete(id);
    else await client.uncomplete(id);
  }

  /**
   * Donne une heure à une tâche, ou la déplace.
   *
   * `dueDate` est l'échéance que l'écran connaît : si elle diffère du jour visé, elle est
   * déplacée dans Todo **avant** d'écrire le placement — si Todo refuse, rien n'est posé,
   * et le planning ne ment pas sur le jour de la tâche.
   */
  async place(
    id: string,
    input: { date: IsoDate; startTime: string; minutes: number; dueDate?: IsoDate | null },
  ): Promise<TodoPlacement> {
    const client = this.require();
    if (input.dueDate !== input.date) await client.setDueDate(id, input.date);
    return this.placements.upsert({
      taskId: id,
      date: input.date,
      startTime: input.startTime,
      minutes: input.minutes,
    });
  }

  /** Retire l'heure. Rien n'est écrit dans Todo : la tâche reste due ce jour-là. */
  unplace(id: string): void {
    this.placements.delete(id);
  }
}
