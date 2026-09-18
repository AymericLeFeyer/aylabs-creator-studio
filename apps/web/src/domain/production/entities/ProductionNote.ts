/**
 * Une note d'une vidéo, rangée comme un petit **fichier** : un titre, un contenu HTML
 * écrit avec le même éditeur que le script. Autant qu'on veut par vidéo — c'est ce qui
 * a remplacé le champ unique « Notes » du formulaire de modification.
 *
 * `title` n'est jamais `null` : vide, l'écran affiche `UNTITLED_NOTE`.
 */
export interface ProductionNote {
  id: string;
  productionId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionNoteInput {
  title?: string;
  content?: string;
}

export const UNTITLED_NOTE = 'Sans titre';

/** Le nom affiché d'une note : son titre, sinon « Sans titre ». */
export const noteTitle = (note: ProductionNote): string => note.title.trim() || UNTITLED_NOTE;
