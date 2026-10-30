/** Le texte d'un script : ce que l'IA lit, sans balises ni étiquettes de mise en forme. */
export const scriptToText = (script: string): string =>
  script
    .replace(/<\/(p|h[1-6]|li|div|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Limite YouTube, cumulée sur tous les tags. */
const TAGS_MAX_LENGTH = 500;

/** Garde les premiers tags tant que le total tient : la mise en ligne rejette au-delà. */
export const fitTags = (tags: string[]): string[] => {
  const kept: string[] = [];
  let length = 0;
  for (const tag of tags.map((entry) => entry.trim()).filter(Boolean)) {
    if (length + tag.length + 1 > TAGS_MAX_LENGTH) break;
    kept.push(tag);
    length += tag.length + 1;
  }
  return kept;
};

/** Un hashtag ne porte ni espace ni signe : `#Domotique Facile` n'en serait pas un. */
export const toHashtag = (value: string): string => `#${value.replace(/[^\p{L}\p{N}_]/gu, '')}`;
