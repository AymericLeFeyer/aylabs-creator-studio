import type { ThumbnailFormat } from '../entities/Thumbnail.ts';

/** Assez pour saisir le sujet d'une vidéo, sans noyer les consignes de mise en forme. */
const SCRIPT_LIMIT = 6000;

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/** Le texte d'un script : du HTML le plus souvent, du markdown s'il n'a jamais été rouvert. */
export const scriptText = (script: string): string =>
  script
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export interface ThumbnailPromptParts {
  generalPrompt: string;
  customPrompt: string;
  title: string | null;
  script: string;
  format: ThumbnailFormat;
  /** Images de la banque, envoyées en premier. */
  bankImages: number;
  /** Images ajoutées pour cette génération, envoyées ensuite. */
  extraImages: number;
}

/**
 * Le prompt envoyé à OpenAI. Le prompt personnalisé vient en dernier : c'est le plus précis,
 * il doit pouvoir nuancer le prompt général.
 *
 * Le rôle de chaque image est écrit noir sur blanc : sans ça, le modèle ne distingue pas la
 * personne à représenter d'un produit à montrer.
 */
export const composeThumbnailPrompt = (parts: ThumbnailPromptParts): string => {
  const { generalPrompt, customPrompt, title, script, format, bankImages, extraImages } = parts;
  const orientation =
    format === '16:9'
      ? 'une miniature YouTube horizontale au format 16:9'
      : 'une miniature verticale au format 9:16';
  const sections = [`Crée ${orientation}, lisible même en très petit.`];

  if (generalPrompt.trim()) sections.push(`Consignes générales :\n${generalPrompt.trim()}`);
  if (bankImages > 0) {
    sections.push(
      `Les ${bankImages} première(s) image(s) montrent la personne à représenter : garde son visage reconnaissable.`,
    );
  }
  if (extraImages > 0) {
    sections.push(
      `Les ${extraImages} dernière(s) image(s) sont des éléments à intégrer à la composition.`,
    );
  }
  if (title) sections.push(`Titre de la vidéo : ${title}`);

  const text = scriptText(script);
  if (text) {
    const excerpt = text.length > SCRIPT_LIMIT ? `${text.slice(0, SCRIPT_LIMIT)}…` : text;
    sections.push(`Script de la vidéo, pour en comprendre le sujet :\n${excerpt}`);
  }
  if (customPrompt.trim()) sections.push(`Pour cette miniature :\n${customPrompt.trim()}`);

  return sections.join('\n\n');
};
