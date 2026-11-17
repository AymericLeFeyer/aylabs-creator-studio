import { z } from 'zod';
import type { AiCostClient } from '../../../domain/ai/repositories/AiRepository.ts';
import { upstream } from '../../../shared/errors.ts';

const responseSchema = z.object({
  data: z.array(
    z.object({
      start_time: z.number(),
      results: z.array(z.object({ amount: z.object({ value: z.number() }).nullish() })),
    }),
  ),
});

const errorSchema = z.object({ error: z.object({ message: z.string().nullish() }) });

/**
 * `GET /v1/organization/costs` : la dépense réelle de l'organisation, par jour. Il faut une
 * clé **admin** (une clé de projet y répond 403). Aucun solde n'existe côté OpenAI.
 */
export class OpenAiCostClient implements AiCostClient {
  async dailyCostsMicros(adminKey: string, since: Date) {
    const start = Math.floor(since.getTime() / 1000);
    let response: Response;
    try {
      response = await fetch(
        `https://api.openai.com/v1/organization/costs?start_time=${start}&bucket_width=1d&limit=180`,
        { headers: { Authorization: `Bearer ${adminKey}` }, signal: AbortSignal.timeout(15_000) },
      );
    } catch (error) {
      throw upstream(`OpenAI injoignable : ${error instanceof Error ? error.message : 'erreur'}`);
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = errorSchema.safeParse(body).data?.error.message;
      throw upstream(message || `OpenAI a répondu ${response.status}`);
    }
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) throw upstream('Réponse de coûts OpenAI illisible.');
    return parsed.data.data.map((bucket) => ({
      day: new Date(bucket.start_time * 1000).toISOString().slice(0, 10),
      micros: Math.round(
        bucket.results.reduce((sum, result) => sum + (result.amount?.value ?? 0), 0) * 1_000_000,
      ),
    }));
  }
}
