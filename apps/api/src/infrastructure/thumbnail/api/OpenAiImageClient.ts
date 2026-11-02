import type {
  ThumbnailCredentials,
  ThumbnailImage,
} from '../../../domain/thumbnail/entities/Thumbnail.ts';
import type {
  ThumbnailGeneration,
  ThumbnailImageClient,
} from '../../../domain/thumbnail/repositories/ThumbnailRepository.ts';
import { upstream } from '../../../shared/errors.ts';

const API_URL = 'https://api.openai.com/v1/images';

/** Sous les 300 s de nginx : l'écran doit recevoir notre erreur, pas un 504 muet. */
const TIMEOUT_MS = 280_000;

interface ImagesResponse {
  data?: Array<{ b64_json?: string }>;
  error?: { message?: string; code?: string };
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const errorMessage = (status: number, body: ImagesResponse): string => {
  if (status === 401) return 'OpenAI refuse la clé : vérifie-la dans Paramètres → API → OpenAI.';
  if (body.error?.code === 'moderation_blocked') {
    return 'OpenAI a refusé cette demande (modération). Reformule le prompt ou change d’image.';
  }
  return `OpenAI : ${body.error?.message ?? `erreur ${status}`}`;
};

/**
 * L'API image d'OpenAI, en `fetch` : deux appels n'imposent pas le SDK.
 *
 * Sortie en **JPEG** et non en PNG : YouTube refuse une miniature de plus de 2 Mo, et un PNG
 * de cette taille les dépasse souvent.
 */
export class OpenAiImageClient implements ThumbnailImageClient {
  async generate(
    credentials: ThumbnailCredentials,
    generation: ThumbnailGeneration,
  ): Promise<ThumbnailImage> {
    const { apiKey, model, quality } = credentials;
    const { prompt, size, images } = generation;
    const options = {
      model,
      prompt,
      size,
      quality,
      output_format: 'jpeg',
      output_compression: '90',
    };
    const headers = { Authorization: `Bearer ${apiKey}` };

    let response: Response;
    try {
      if (images.length === 0) {
        response = await fetch(`${API_URL}/generations`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...options, output_compression: 90 }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } else {
        const form = new FormData();
        for (const [key, value] of Object.entries(options)) form.set(key, value);
        images.forEach((image, index) => {
          const name = `image-${index}.${EXTENSIONS[image.mimeType] ?? 'png'}`;
          form.append('image[]', new Blob([image.data], { type: image.mimeType }), name);
        });
        response = await fetch(`${API_URL}/edits`, {
          method: 'POST',
          headers,
          body: form,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw upstream('OpenAI n’a pas répondu à temps. Réessaie.');
      }
      throw upstream('OpenAI est injoignable.');
    }

    const body = (await response.json().catch(() => ({}))) as ImagesResponse;
    if (!response.ok) throw upstream(errorMessage(response.status, body));

    const encoded = body.data?.[0]?.b64_json;
    if (!encoded) throw upstream('OpenAI n’a renvoyé aucune image.');
    return { data: Uint8Array.from(Buffer.from(encoded, 'base64')), mimeType: 'image/jpeg' };
  }
}
