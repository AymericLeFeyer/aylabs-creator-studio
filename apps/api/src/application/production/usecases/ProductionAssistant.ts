import type { AiClient } from '../../../domain/ai/repositories/AiRepository.ts';
import { sanitizeNoteHtml } from '../../../domain/mail/services/threading.ts';
import type { ProductionView } from '../../../domain/production/entities/Production.ts';
import type { ProductionRepository } from '../../../domain/production/repositories/ProductionRepository.ts';
import {
  fitTags,
  scriptToText,
  toHashtag,
} from '../../../domain/production/services/scriptText.ts';
import { badRequest, notFound, upstream } from '../../../shared/errors.ts';
import type { ManageAi } from '../../ai/usecases/ManageAi.ts';

const BASE_SYSTEM =
  'Tu assistes un créateur de vidéos YouTube. Tu écris dans la langue du script, à défaut dans celle de la demande. Tu gardes le ton du créateur. Tu n’inventes jamais un chiffre, un prix, une caractéristique ou un fait : ce que tu ne sais pas devient « [à compléter] ».';

const SCRIPT_SYSTEM = `${BASE_SYSTEM}

Un script est dit à voix haute, face caméra : des phrases courtes, un ton parlé, pas de tournure écrite.
Réponds uniquement avec le texte demandé, en HTML simple (p, h2, h3, ul, ol, li, strong, em), sans bloc de code, sans introduction ni commentaire.`;

const TITLES_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['titles'],
  properties: { titles: { type: 'array', items: { type: 'string' } } },
};

const TAGS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['tags', 'hashtags'],
  properties: {
    tags: { type: 'array', items: { type: 'string' } },
    hashtags: { type: 'array', items: { type: 'string' } },
  },
};

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

const parseJson = (raw: string): Record<string, unknown> => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw upstream('Réponse de l’IA illisible : réessaie.');
  }
};

const avoidBlock = (avoid: string[]): string =>
  avoid.length > 0
    ? `\n\nDéjà proposé, à ne pas reprendre ni paraphraser :\n${avoid.map((entry) => `- ${entry}`).join('\n')}`
    : '';

/**
 * L'IA d'une fiche de production : écrire le script, et préparer sa mise en ligne.
 *
 * **Elle ne fait que proposer** : chaque méthode rend un texte et n'écrit rien en base.
 * C'est l'écran qui le pose dans l'éditeur ou le formulaire, sur un clic.
 */
export class ProductionAssistant {
  private readonly productions: ProductionRepository;
  private readonly ai: AiClient;
  private readonly settings: ManageAi;

  constructor(deps: { productions: ProductionRepository; ai: AiClient; settings: ManageAi }) {
    this.productions = deps.productions;
    this.ai = deps.ai;
    this.settings = deps.settings;
  }

  private production(id: string): ProductionView {
    const production = this.productions.findViewById(id);
    if (!production) throw notFound('Production');
    return production;
  }

  /** Le script enregistré. Sans lui, un titre ou des tags seraient inventés de toutes pièces. */
  private scriptOf(production: ProductionView): string {
    const text = scriptToText(production.script);
    if (!text) throw badRequest('Écris d’abord le script : l’IA s’appuie dessus.');
    return text;
  }

  private ask(system: string, prompt: string, schema?: Record<string, unknown>) {
    return this.ai.complete(this.settings.credentials(), { system, prompt, schema });
  }

  /**
   * Écrit ou réécrit. `script` et `selection` viennent de l'éditeur, en texte : le script
   * enregistré peut retarder d'une phrase sur ce qui est à l'écran.
   */
  async writeScript(
    id: string,
    input: { prompt: string; script: string; selection: string | null },
  ): Promise<string> {
    const production = this.production(id);
    const context = input.script.trim() ? `\n\nScript actuel :\n${input.script}` : '';
    const task = input.selection
      ? `Passage à réécrire :\n${input.selection}\n\nRends uniquement ce passage réécrit, pas le reste du script.`
      : 'Rends uniquement le texte à ajouter au script.';
    const html = sanitizeNoteHtml(
      await this.ask(
        SCRIPT_SYSTEM,
        `Vidéo : ${production.title}${context}\n\n${task}\n\nDemande : ${input.prompt}`,
      ),
    );
    if (!html) throw upstream('L’IA n’a rien répondu.');
    return html;
  }

  async titles(id: string, avoid: string[]): Promise<string[]> {
    const production = this.production(id);
    const raw = await this.ask(
      `${BASE_SYSTEM}\n\nTu proposes trois titres YouTube très différents les uns des autres dans leur angle. Chacun donne envie de cliquer sans mentir sur le contenu, et tient en 70 caractères environ, 100 au grand maximum.`,
      `Titre de travail : ${production.title}\n\nScript :\n${this.scriptOf(production)}${avoidBlock(avoid)}`,
      TITLES_SCHEMA,
    );
    const titles = stringsOf(parseJson(raw).titles)
      .map((title) => title.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (titles.length === 0) throw upstream('L’IA n’a proposé aucun titre : réessaie.');
    return titles;
  }

  async tags(id: string): Promise<{ tags: string[]; hashtags: string[] }> {
    const production = this.production(id);
    const raw = await this.ask(
      `${BASE_SYSTEM}\n\nTu prépares le référencement d’une vidéo YouTube : une quinzaine de tags (les recherches qu’un spectateur taperait, du plus précis au plus général) et trois à cinq hashtags, du plus important au moins important.`,
      `Titre : ${production.publishTitle || production.title}\n\nScript :\n${this.scriptOf(production)}`,
      TAGS_SCHEMA,
    );
    const parsed = parseJson(raw);
    return {
      tags: fitTags(stringsOf(parsed.tags)),
      hashtags: stringsOf(parsed.hashtags).map(toHashtag),
    };
  }

  async description(id: string, avoid: string[]): Promise<string> {
    const production = this.production(id);
    return this.ask(
      `${BASE_SYSTEM}\n\nTu écris le début de la description YouTube : deux à trois phrases qui disent ce que le spectateur va voir, la première étant celle qui s’affiche avant « Plus ». Texte brut, sans lien, sans hashtag, sans emoji, sans guillemets autour.`,
      `Titre : ${production.publishTitle || production.title}\n\nScript :\n${this.scriptOf(production)}${avoidBlock(avoid)}`,
    );
  }
}
