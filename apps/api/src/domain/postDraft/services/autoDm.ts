/** Minuscules, sans accents : « Lien » et « lién » déclenchent le même mot-clé. */
const fold = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Les mots déclencheurs d'une règle (séparés par des virgules ou des retours à la ligne). */
export const parseKeywords = (raw: string): string[] =>
  raw
    .split(/[,\n]/)
    .map((word) => fold(word).trim())
    .filter(Boolean);

/** Un commentaire déclenche-t-il le DM ? Sans mot-clé, tout commentaire le déclenche. */
export const matchesKeywords = (comment: string, rawKeywords: string): boolean => {
  const keywords = parseKeywords(rawKeywords);
  if (keywords.length === 0) return true;
  const text = fold(comment);
  return keywords.some((keyword) => text.includes(keyword));
};

/** Le message envoyé : `{prenom}` devient le nom d'utilisateur du commentateur. */
export const renderDmMessage = (template: string, username: string | null): string =>
  template
    .replaceAll('{prenom}', username ?? '')
    .replace(/ {2,}/g, ' ')
    .trim();
