import type { TodoTag, TodoTask } from '../../../domain/todoApp/entities/TodoTask.ts';
import type {
  TodoTaskQuery,
  TodoTaskSource,
} from '../../../domain/todoApp/repositories/TodoRepository.ts';
import type { IsoDate } from '../../../shared/dates.ts';
import { notFound, upstream } from '../../../shared/errors.ts';

interface RawTask {
  id: string;
  title: string;
  dueDate: string | null;
  duration: number | null;
  completedAt: string | null;
  tags?: Array<{ name: string; slug: string; color: string }>;
}

const toTask = (raw: RawTask): TodoTask => ({
  id: raw.id,
  title: raw.title,
  dueDate: raw.dueDate,
  duration: raw.duration,
  completedAt: raw.completedAt,
  tags: (raw.tags ?? []).map((tag): TodoTag => ({
    name: tag.name,
    slug: tag.slug,
    color: tag.color,
  })),
});

/**
 * L'API REST de l'app Todo (dossier voisin `todo`, Fastify).
 *
 * Authentification par `X-API-Key`, **facultative** : une instance sans `APP_PASSWORD`
 * répond sans clé, et c'est le cas courant d'un homelab derrière VPN.
 *
 * `Content-Type` n'est posé **que s'il y a un corps** : Fastify rejette en 400 une requête
 * JSON à corps vide (`FST_ERR_CTP_EMPTY_JSON_BODY`), ce qui ferait échouer
 * `POST /complete` — le piège est noté dans le CLAUDE.md de Todo.
 */
export class TodoAppClient implements TodoTaskSource {
  private readonly baseUrl: string;
  private readonly apiKey: string | null;

  constructor(baseUrl: string, apiKey: string | null) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  private async call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        // Une instance injoignable ne doit pas bloquer l'écran de planning : mieux vaut une
        // grille sans tâches, avec un bandeau, qu'une page qui ne s'affiche pas.
        signal: AbortSignal.timeout(8_000),
      });
    } catch (error) {
      throw upstream(
        `Todo injoignable : ${error instanceof Error ? error.message : 'erreur réseau'}`,
      );
    }

    if (response.status === 401) {
      throw upstream(
        this.apiKey
          ? 'Clé API Todo refusée. Crée-en une dans Todo → Réglages → Clés API.'
          : 'Todo demande une clé API : crée-en une dans Todo → Réglages → Clés API.',
      );
    }
    if (response.status === 404) throw notFound('Tâche Todo');
    if (!response.ok) throw upstream(`Todo a répondu ${response.status}`);

    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  async listTasks(query: TodoTaskQuery): Promise<TodoTask[]> {
    const params = new URLSearchParams({ status: query.status, limit: '500' });
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (query.tags.length > 0) {
      params.set('tags', query.tags.join(','));
      params.set('tagsMode', 'any');
    }
    const result = await this.call<{ tasks: RawTask[] }>(`/api/tasks?${params.toString()}`);
    return (result?.tasks ?? []).map(toTask);
  }

  async complete(id: string): Promise<void> {
    await this.call(`/api/tasks/${encodeURIComponent(id)}/complete`, { method: 'POST' });
  }

  async uncomplete(id: string): Promise<void> {
    await this.call(`/api/tasks/${encodeURIComponent(id)}/uncomplete`, { method: 'POST' });
  }

  async setDueDate(id: string, dueDate: IsoDate): Promise<void> {
    await this.call(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { dueDate },
    });
  }
}
