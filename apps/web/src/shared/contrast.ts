/**
 * Choix d'une couleur de texte lisible sur un fond donné.
 *
 * Les couleurs de chaîne sont libres : un vert clair et un bleu nuit peuvent cohabiter,
 * et écrire en blanc sur les deux rend le premier illisible. On calcule donc le contraste
 * réel (WCAG) contre du blanc et contre l'encre du thème, et on garde le meilleur des
 * deux — plutôt qu'un seuil de luminance approximatif qui se trompe dans les tons moyens.
 */

/** Encre sombre du thème, plus douce qu'un noir pur sur une pastille colorée. */
const INK = '#0f172a';
const PAPER = '#ffffff';

const parseHex = (hex: string): [number, number, number] | null => {
  const value = hex.trim().replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
};

/** Luminance relative sRGB (WCAG 2.1). */
const luminance = (rgb: [number, number, number]): number => {
  const linear = rgb.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const ratio = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * Renvoie `#ffffff` ou l'encre sombre, selon ce qui se lit le mieux sur `background`.
 * Une couleur non reconnue retombe sur l'encre : illisible vaut mieux qu'invisible.
 */
export const readableTextColor = (background: string): string => {
  const rgb = parseHex(background);
  if (!rgb) return INK;

  const backgroundLuminance = luminance(rgb);
  const onPaper = ratio(backgroundLuminance, luminance(parseHex(PAPER)!));
  const onInk = ratio(backgroundLuminance, luminance(parseHex(INK)!));

  return onPaper >= onInk ? PAPER : INK;
};
