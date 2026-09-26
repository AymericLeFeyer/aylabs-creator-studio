import type { IsoDate } from '../../../shared/dates.ts';
import type { TodoPlacement, TodoTask } from '../entities/TodoTask.ts';

export interface TodoPlacementRepository {
  findInRange(from: IsoDate, to: IsoDate): TodoPlacement[];
  /** Crée ou remplace l'heure d'une tâche : une tâche n'a qu'une place à la fois. */
  upsert(placement: TodoPlacement): TodoPlacement;
  delete(taskId: string): void;
  deleteMany(taskIds: string[]): void;
}

/** La connexion telle qu'elle est rangée : la clé y est **chiffrée**. */
export interface StoredTodoConnection {
  baseUrl: string | null;
  encryptedKey: string | null;
  tags: string[];
}

export interface TodoConnectionRepository {
  get(): StoredTodoConnection;
  /** Champ absent = conservé. */
  update(patch: Partial<StoredTodoConnection>): void;
}

/** Ce que `ManageTodoTasks` attend du chiffrement. `SecretBox` y répond tel quel. */
export interface TodoSecretCipher {
  readonly available: boolean;
  encrypt(plain: string, context: string): string;
  decrypt(payload: string, context: string): string | null;
}

export interface TodoTaskQuery {
  status: 'open' | 'done' | 'all';
  from?: IsoDate;
  to?: IsoDate;
  /** Slugs. Vide = pas de filtre. Une tâche passe si elle porte **l'un** d'eux. */
  tags: string[];
}

/** Une tâche que le studio pose dans Todo. */
export interface NewTodoTask {
  title: string;
  notes?: string | null;
  dueDate: IsoDate;
  /** 15, 30 ou 60. */
  duration?: 15 | 30 | 60 | null;
  tags?: string[];
  /**
   * Clé d'idempotence (`acs:…`) : Todo rend la tâche existante au lieu d'en créer une
   * seconde. C'est ce qui rend un POST rejoué (panne réseau, redémarrage) sans danger.
   */
  externalId: string;
}

/**
 * Ce que le studio a déjà posé dans Todo, par clé métier (`release:production:<id>`,
 * `legal:<obligation>:<AAAA-MM>`). **La ligne ne disparaît jamais** : une tâche supprimée
 * à la main dans Todo ne doit pas revenir à la synchro suivante.
 */
export interface TodoLink {
  key: string;
  taskId: string;
  /** Dernier état « fait » connu **des deux côtés** : c'est ce qui dit lequel a bougé. */
  done: boolean;
}

export interface TodoLinkRepository {
  find(key: string): TodoLink | null;
  findByPrefix(prefix: string): TodoLink[];
  save(link: TodoLink): void;
}

/** L'API de l'app Todo, vue du planning. */
export interface TodoTaskSource {
  listTasks(query: TodoTaskQuery): Promise<TodoTask[]>;
  /** `null` si la tâche a été supprimée dans Todo. */
  getTask(id: string): Promise<TodoTask | null>;
  createTask(input: NewTodoTask): Promise<TodoTask>;
  complete(id: string): Promise<void>;
  uncomplete(id: string): Promise<void>;
  setDueDate(id: string, dueDate: IsoDate): Promise<void>;
}
