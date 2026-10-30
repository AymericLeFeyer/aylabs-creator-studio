import type { AiUsage } from '../entities/Ai.ts';

interface ModelPrice {
  /** En dollars par million de jetons, soit en millionièmes de dollar par jeton. */
  input: number;
  output: number;
}

/** Tarifs publics d'Anthropic. Un modèle absent est compté au tarif d'Opus 5. */
const PRICES: Record<string, ModelPrice> = {
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

const FALLBACK_PRICE: ModelPrice = { input: 5, output: 25 };

/** Lecture du cache à 0,1 fois le tarif d'entrée, écriture à 1,25 fois. */
const CACHE_READ_FACTOR = 0.1;
const CACHE_WRITE_FACTOR = 1.25;

/** Le coût d'un appel, en millionièmes de dollar : un appel coûte moins d'un centime. */
export const usageCostMicros = (usage: AiUsage): number => {
  const price = PRICES[usage.model] ?? FALLBACK_PRICE;
  return Math.ceil(
    usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.input * CACHE_READ_FACTOR +
      usage.cacheWriteTokens * price.input * CACHE_WRITE_FACTOR,
  );
};
