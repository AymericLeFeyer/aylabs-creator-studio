import { z } from 'zod';
import type { AiCredentials } from '../../../domain/ai/entities/Ai.ts';
import type {
  AiClient,
  AiObserver,
  AiRequest,
} from '../../../domain/ai/repositories/AiRepository.ts';
import { upstream } from '../../../shared/errors.ts';

const responseSchema = z.object({
  status: z.string(),
  model: z.string(),
  incomplete_details: z.object({ reason: z.string() }).nullish(),
  output: z.array(
    z.object({
      type: z.string(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    }),
  ),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
      input_tokens_details: z
        .object({
          cached_tokens: z.number().int().nonnegative().optional(),
          cache_write_tokens: z.number().int().nonnegative().optional(),
        })
        .nullish(),
    })
    .nullish(),
});

const errorSchema = z.object({ error: z.object({ code: z.string().nullish() }) });

export class OpenAiTextClient implements AiClient {
  private readonly observer: AiObserver;

  constructor(observer: AiObserver) {
    this.observer = observer;
  }

  async complete(credentials: AiCredentials, request: AiRequest): Promise<string> {
    let response: Response;
    let body: unknown;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: credentials.model,
          instructions: request.system,
          input: request.prompt,
          max_output_tokens: 16_000,
          store: false,
          ...(request.schema
            ? {
                text: {
                  format: {
                    type: 'json_schema',
                    name: 'studio_response',
                    strict: true,
                    schema: request.schema,
                  },
                },
              }
            : {}),
        }),
        signal: AbortSignal.timeout(120_000),
      });
      body = await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw upstream('OpenAI n’a pas répondu à temps. Réessaie.');
      }
      if (error instanceof SyntaxError) throw upstream('OpenAI a renvoyé une réponse illisible.');
      throw upstream('OpenAI est injoignable.');
    }

    if (!response.ok) {
      const error = errorSchema.safeParse(body);
      throw upstream(this.errorMessage(response.status, error.data?.error.code));
    }

    const result = responseSchema.safeParse(body);
    if (!result.success) throw upstream('OpenAI a renvoyé une réponse illisible.');
    const { model, usage, status, output } = result.data;
    if (usage) {
      const cacheReadTokens = usage.input_tokens_details?.cached_tokens ?? 0;
      const cacheWriteTokens = usage.input_tokens_details?.cache_write_tokens ?? 0;
      this.observer.usage({
        model,
        // OpenAI inclut le cache dans le total des jetons d'entrée.
        inputTokens: Math.max(0, usage.input_tokens - cacheReadTokens - cacheWriteTokens),
        outputTokens: usage.output_tokens,
        cacheReadTokens,
        cacheWriteTokens,
      });
    }

    const content = output.flatMap((item) => (item.type === 'message' ? (item.content ?? []) : []));
    if (content.some((part) => part.type === 'refusal')) {
      throw upstream('L’IA a refusé de traiter ce contenu.');
    }
    if (status === 'incomplete') {
      if (result.data.incomplete_details?.reason === 'max_output_tokens') {
        throw upstream('La réponse de l’IA a été coupée : demande quelque chose de plus court.');
      }
      throw upstream('OpenAI a renvoyé une réponse incomplète.');
    }
    if (status !== 'completed') throw upstream('OpenAI n’a pas terminé la réponse.');
    const text = content
      .flatMap((part) => (part.type === 'output_text' && part.text ? [part.text] : []))
      .join('')
      .trim();
    if (!text) throw upstream('L’IA n’a rien répondu.');
    return text;
  }

  private errorMessage(status: number, code: string | null | undefined): string {
    if (status === 401) {
      return 'Clé API OpenAI refusée : vérifie-la dans Paramètres → API → Assistant IA.';
    }
    if (code === 'credit_balance_exhausted') {
      this.observer.creditExhausted();
      return 'Crédits OpenAI épuisés : vérifie la facturation du compte API.';
    }
    if (code === 'insufficient_quota') {
      return 'Quota OpenAI insuffisant : vérifie les crédits et les limites du compte API.';
    }
    if (status === 429) return 'L’API OpenAI limite les appels : réessaie dans un instant.';
    if (code === 'model_not_found' || status === 403) {
      return 'Accès OpenAI refusé : vérifie le modèle et les permissions de la clé API.';
    }
    if (code === 'invalid_json_schema') {
      return 'OpenAI a refusé le format de réponse demandé pour ce modèle.';
    }
    return `Erreur de l’API OpenAI (${status}).`;
  }
}
