/**
 * La palette de l'éditeur de script.
 *
 * **Des couleurs en dur, et non les tokens du thème.** Une couleur choisie ici est écrite
 * dans le script et lui survit ; un `var(--cash)` se relirait différemment le jour où la
 * palette du thème bouge, et le CSSOM ne garantit pas de la restituer telle quelle à la
 * relecture. Les valeurs sont donc figées — mais **prises à mi-clarté** (L ≈ 0,62) pour
 * rester lisibles sur le fond clair comme sur le fond sombre : un script s'écrit dans un
 * thème et se relit souvent dans l'autre.
 *
 * Le surlignage, lui, est **transparent** plutôt qu'opaque, pour la même raison : un fond
 * opaque clair rendrait le texte du thème sombre illisible, alors qu'un voile à 25 %
 * teinte les deux sans jamais toucher au contraste du texte.
 */
export interface Swatch {
  label: string;
  value: string;
}

export const TEXT_COLORS: Swatch[] = [
  { label: 'Rouge', value: 'oklch(0.62 0.21 27)' },
  { label: 'Orange', value: 'oklch(0.68 0.16 55)' },
  { label: 'Vert', value: 'oklch(0.65 0.17 155)' },
  { label: 'Bleu', value: 'oklch(0.62 0.17 250)' },
  { label: 'Violet', value: 'oklch(0.62 0.19 305)' },
  { label: 'Rose', value: 'oklch(0.65 0.2 350)' },
];

export const HIGHLIGHT_COLORS: Swatch[] = [
  { label: 'Jaune', value: 'oklch(0.85 0.16 95 / 0.35)' },
  { label: 'Rouge', value: 'oklch(0.62 0.21 27 / 0.28)' },
  { label: 'Vert', value: 'oklch(0.65 0.17 155 / 0.28)' },
  { label: 'Bleu', value: 'oklch(0.62 0.17 250 / 0.28)' },
  { label: 'Violet', value: 'oklch(0.62 0.19 305 / 0.28)' },
  { label: 'Gris', value: 'oklch(0.62 0 0 / 0.25)' },
];
