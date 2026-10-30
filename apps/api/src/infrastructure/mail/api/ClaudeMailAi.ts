import Anthropic from '@anthropic-ai/sdk';
import type { MailAi } from '../../../domain/mail/repositories/MailRepository.ts';
import { AppError, upstream } from '../../../shared/errors.ts';

/**
 * Les modèles pour lesquels le repli côté serveur (`fallbacks: 'default'`) existe : sur
 * un refus des classificateurs de sécurité, la même requête est rejouée sur un autre modèle
 * dans le même appel. Un modèle hors liste répondrait 400 au paramètre.
 */
const supportsFallback = (model: string): boolean =>
  model === 'claude-opus-5' || model.startsWith('claude-fable-5');

/**
 * L'assistant mail, par le SDK officiel d'Anthropic. Une requête, un texte : aucun outil,
 * et surtout **aucun moyen d'envoyer quoi que ce soit** — ce qu'il rend est posé dans le
 * brouillon, que l'on relit et envoie soi-même.
 */
export class ClaudeMailAi implements MailAi {
  async complete(input: { apiKey: string; model: string; system: string; prompt: string }) {
    const client = new Anthropic({ apiKey: input.apiKey });
    const fallback = supportsFallback(input.model);
    try {
      const response = await client.beta.messages.create({
        model: input.model,
        max_tokens: 16000,
        system: input.system,
        messages: [{ role: 'user', content: input.prompt }],
        ...(fallback
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
      });
      if (response.stop_reason === 'refusal') {
        throw upstream('L’IA a refusé de traiter ce message.');
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
        throw upstream('Clé API Anthropic refusée : vérifie-la dans Paramètres → Mails.');
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
