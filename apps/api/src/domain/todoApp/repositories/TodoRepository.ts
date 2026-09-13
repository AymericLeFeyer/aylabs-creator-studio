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

/** L'API de l'app Todo, vue du planning. */
export interface TodoTaskSource {
  listTasks(query: TodoTaskQuery): Promise<TodoTask[]>;
  complete(id: string): Promise<void>;
  uncomplete(id: string): Promise<void>;
  setDueDate(id: string, dueDate: IsoDate): Promise<void>;
}
