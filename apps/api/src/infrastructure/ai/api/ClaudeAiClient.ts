import Anthropic from '@anthropic-ai/sdk';
import type { AiCredentials } from '../../../domain/ai/entities/Ai.ts';
import type { AiClient, AiRequest } from '../../../domain/ai/repositories/AiRepository.ts';
import { AppError, upstream } from '../../../shared/errors.ts';

/**
 * Les modèles pour lesquels le repli côté serveur (`fallbacks: 'default'`) existe : sur
 * un refus des classificateurs de sécurité, la même requête est rejouée sur un autre modèle
 * dans le même appel. Un modèle hors liste répondrait 400 au paramètre.
 */
const supportsFallback = (model: string): boolean =>
  model === 'claude-opus-5' || model.startsWith('claude-fable-5');

/**
 * Claude, par le SDK officiel d'Anthropic. Une requête, une réponse : aucun outil, et donc
 * **aucun moyen d'agir** — ce qu'il rend est appliqué par le code appelant, dans les limites
 * que celui-ci fixe.
 *
 * Avec un `schema`, la réponse est contrainte au format (`output_config.format`) : c'est ce
 * qui permet de tirer des tâches datées d'un fil de mails sans parser du texte libre.
 */
export class ClaudeAiClient implements AiClient {
  async complete(credentials: AiCredentials, request: AiRequest): Promise<string> {
    const client = new Anthropic({ apiKey: credentials.apiKey });
    const fallback = supportsFallback(credentials.model);
    try {
      const response = await client.beta.messages.create({
        model: credentials.model,
        max_tokens: 16000,
        system: request.system,
        messages: [{ role: 'user', content: request.prompt }],
        ...(request.schema
          ? { output_config: { format: { type: 'json_schema' as const, schema: request.schema } } }
          : {}),
        ...(fallback
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
      });
      if (response.stop_reason === 'refusal') {
        throw upstream('L’IA a refusé de traiter ce contenu.');
      }
      const text = response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('')
        .trim();
      if (!text) throw upstream('L’IA n’a rien répondu.');
      return text;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Anthropic.AuthenticationError) {
        throw upstream(
          'Clé API Anthropic refusée : vérifie-la dans Paramètres → API → Assistant IA.',
        );
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw upstream('L’API Anthropic limite les appels : réessaie dans un instant.');
      }
      if (error instanceof Anthropic.APIError) {
        throw upstream(`Erreur de l’API Anthropic (${error.status ?? '?'}) : ${error.message}`);
      }
      throw upstream(`IA injoignable : ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
