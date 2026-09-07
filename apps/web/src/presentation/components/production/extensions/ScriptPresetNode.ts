import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Un gabarit inséré dans le script : le rappel d'abonnement, l'appel à l'action de fin.
 *
 * **Le contenu est copié, pas référencé.** Le noeud ne porte aucune clé vers
 * `script_presets` — seulement le nom et la couleur du gabarit d'où il vient. Un appel à
 * l'action se retouche pour la vidéo qu'on écrit (le produit du jour, le nom de la
 * marque), et un bloc qui se réécrirait depuis les paramètres emporterait ces retouches
 * sans prévenir. C'est aussi ce qui permet de lire le script à voix haute d'un bout à
 * l'autre : le texte est là, il n'est pas ailleurs.
 *
 * `content: 'block+'` : ce qu'on insère est du vrai contenu de script — paragraphes,
 * listes, gras, couleurs — et pas un texte figé. On peut donc écrire dedans, et c'est
 * l'intérêt.
 *
 * L'étiquette est rendue par un `::before` CSS lisant `data-preset-label`, plutôt que par
 * une `NodeView` React : elle n'est qu'un repère visuel, elle ne se clique pas, et une
 * `NodeView` ferait entrer React dans le cycle de rendu de ProseMirror pour afficher un
 * mot.
 */
export const ScriptPresetNode = Node.create({
  name: 'scriptPreset',
  group: 'block',
  content: 'block+',

  /**
   * `defining` garde le bloc lors d'un copier-coller et d'un retour arrière en tête :
   * sans lui, vider la première ligne dissoudrait l'encadré et il faudrait le réinsérer.
   */
  defining: true,

  addAttributes() {
    return {
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-preset-label') ?? '',
        renderHTML: (attributes) => ({ 'data-preset-label': attributes.label as string }),
      },
      color: {
        default: '#3b82f6',
        parseHTML: (element) => element.getAttribute('data-preset-color') ?? '#3b82f6',
        renderHTML: (attributes) => ({
          'data-preset-color': attributes.color as string,
          style: `--preset-color: ${attributes.color as string}`,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-script-preset]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-script-preset': '' }), 0];
  },
});
