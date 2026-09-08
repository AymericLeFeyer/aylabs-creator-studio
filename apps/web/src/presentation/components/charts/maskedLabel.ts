/**
 * Le message d'un bloc entièrement masqué.
 *
 * Il vit dans son propre fichier plutôt qu'à côté d'un des deux composants qui
 * l'affichent : `DonutBreakdown` et `RankingBars` doivent dire exactement la même
 * chose, et un fichier qui exporte un composant **et** une constante déclencherait
 * `react-refresh/only-export-components` — même découpage que `videoMarkers.tsx`.
 *
 * « Masqué » et non « aucune donnée » : les deux mènent au même écran vide, mais l'un
 * se corrige dans les paramètres et l'autre à la prochaine collecte.
 */
export const MASKED_BREAKDOWN_LABEL =
  'Masqué par la confidentialité. À rallumer dans Paramètres → Application.';
