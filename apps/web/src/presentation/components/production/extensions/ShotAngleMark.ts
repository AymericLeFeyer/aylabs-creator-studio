import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    shotAngle: {
      setShotAngle: (attributes: { angleId: string; label: string; color: string }) => ReturnType;
      unsetShotAngle: () => ReturnType;
    };
  }
}

/**
 * L'angle de vue posé sur un passage du script.
 *
 * **Une marque et non un noeud** : on veut annoter une phrase au milieu d'un paragraphe
 * — parfois une demi-phrase — sans découper le texte en blocs. Un noeud imposerait de
 * respecter la structure du document là où le tournage, lui, suit la parole.
 *
 * **Elle porte le libellé et la couleur, pas seulement l'identifiant.** Un script est un
 * document HTML autonome : n'y écrire qu'une clé étrangère ferait perdre teinte et nom le
 * jour où l'angle est supprimé ou renommé dans les paramètres — et un script d'il y a six
 * mois redeviendrait illisible. `angleId` reste là pour reconnaître un angle encore
 * existant (l'état actif du menu), jamais pour aller chercher le reste.
 *
 * Les attributs sont des `data-*` et **le style n'est que du rendu** : `parseHTML` lit
 * `data-shot-color`, jamais `element.style`, que le CSSOM normalise différemment d'un
 * navigateur à l'autre. C'est la leçon déjà apprise sur les couleurs de texte.
 */
export const ShotAngleMark = Mark.create({
  name: 'shotAngle',

  /**
   * Deux angles ne se superposent pas : marquer un passage déjà marqué **remplace**
   * l'ancien. Un plan ne se tourne pas sous deux cadrages à la fois, et deux fonds
   * empilés ne donneraient qu'une troisième couleur illisible.
   */
  excludes: 'shotAngle',

  /** Le fond doit envelopper le texte, pas s'insérer entre deux marques de mise en forme. */
  inclusive: false,

  addAttributes() {
    return {
      angleId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-shot-angle'),
        renderHTML: (attributes) => ({ 'data-shot-angle': attributes.angleId as string }),
      },
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-shot-label') ?? '',
        renderHTML: (attributes) => ({ 'data-shot-label': attributes.label as string }),
      },
      color: {
        default: '#3b82f6',
        parseHTML: (element) => element.getAttribute('data-shot-color') ?? '#3b82f6',
        renderHTML: (attributes) => ({
          'data-shot-color': attributes.color as string,
          // La teinte voyage en variable CSS : la feuille de style en tire un fond
          // translucide, lisible sur le thème clair comme sur le sombre.
          style: `--shot-color: ${attributes.color as string}`,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-shot-angle]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setShotAngle:
        (attributes) =>
        ({ chain }) =>
          chain().setMark(this.name, attributes).run(),
      unsetShotAngle:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name).run(),
    };
  },
});
