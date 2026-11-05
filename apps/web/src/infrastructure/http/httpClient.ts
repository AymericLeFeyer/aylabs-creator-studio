/**
 * Client HTTP unique de l'application. Aucun `fetch` ne doit apparaître ailleurs :
 * la base d'URL, la sérialisation et le format d'erreur sont décidés ici.
 *
 * En dev, `VITE_API_URL` est vide et Vite proxifie `/api` vers l'API locale.
 * En production, nginx sert le front et proxifie `/api` vers le conteneur de l'API,
 * donc l'URL relative fonctionne dans les deux cas.
 */
const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    status: number,
    code: string,
    details: Array<{ field: string; message: string }> = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Paramètres de requête ; les valeurs `undefined` sont ignorées. */
  query?: Record<string, string | number | boolean | undefined>;
}

export const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { method = 'GET', body, query } = options;

  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // 204 No Content : pas de corps à lire.
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const error = payload as {
      error?: string;
      code?: string;
      details?: Array<{ field: string; message: string }>;
    } | null;
    throw new ApiError(
      error?.error ?? `Erreur ${response.status}`,
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.details ?? [],
    );
  }

  return payload as T;
};

/**
 * Envoi d'un fichier en **corps brut**, avec sa progression. `fetch` ne sait pas rapporter
 * l'avancement d'un envoi : c'est le seul endroit de l'application qui passe par
 * `XMLHttpRequest`, pour une vidéo de plusieurs centaines de Mo.
 */
export const uploadFile = <T>(
  path: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', new URL(`${BASE_URL}${path}`, window.location.origin).toString());
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new ApiError('Envoi interrompu (réseau)', 0, 'NETWORK'));
    xhr.onload = () => {
      const payload = xhr.responseText ? (JSON.parse(xhr.responseText) as unknown) : null;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload as T);
        return;
      }
      const error = payload as { error?: string; code?: string } | null;
      reject(
        new ApiError(error?.error ?? `Erreur ${xhr.status}`, xhr.status, error?.code ?? 'UNKNOWN'),
      );
    };
    xhr.send(file);
  });
