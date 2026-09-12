/**
 * Lit un nombre tel qu'un site français l'affiche : `1 234,56 €`, `4,2 %`, `12`.
 *
 * Les pages scrapées ne rendent que du texte mis en forme, avec des espaces insécables
 * (U+00A0, U+202F) comme séparateurs de milliers : tout ce qui n'est ni chiffre, ni virgule,
 * ni point, ni signe est retiré. Quand virgule et point cohabitent,
 * c'est le **dernier** qui est décimal (`1.234,56` comme `1,234.56`) ; un point seul
 * suivi de groupes de trois chiffres est un séparateur de milliers.
 *
 * `null` quand le texte ne contient aucun chiffre : « — » ou une cellule vide ne valent
 * pas zéro.
 */
export const parseLocaleNumber = (text: string | null | undefined): number | null => {
  if (!text) return null;
  const cleaned = text.replace(/[^\d,.-]/g, '');
  if (!/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    normalized = cleaned.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    normalized = cleaned.replace(/,/g, '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '');
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
};

/** Arrondi à deux décimales : l'export parle en euros, pas en fractions de centime. */
export const round2 = (value: number): number => Math.round(value * 100) / 100;
