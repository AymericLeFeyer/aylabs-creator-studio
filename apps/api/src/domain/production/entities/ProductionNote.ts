/**
 * Une note d'une vidéo, rangée comme un petit **fichier** : un titre, un contenu.
 *
 * Il y en a autant qu'on veut par vidéo — une idée de plan, une liste de références, les
 * retours d'un relecteur — là où l'ancien champ unique `productions.notes` mêlait tout
 * dans un seul bloc qu'on ne relisait plus. Le contenu est du **HTML**, écrit avec le
 * même éditeur que le script : une note qui ne saurait pas faire une liste à cocher ou
 * un lien ferait retourner vers un outil externe.
 *
 * `title` n'est jamais `null` : vide, l'écran affiche « Sans titre ».
 */
export interface ProductionNote {
  id: string;
  productionId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductionNoteInput {
  title?: string;
  content?: string;
}

export type UpdateProductionNoteInput = CreateProductionNoteInput;
