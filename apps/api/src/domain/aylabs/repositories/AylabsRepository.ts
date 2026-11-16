export interface AylabsFile {
  path: string;
  content: string;
}

/** Le dépôt du site aylabs.fr. */
export interface AylabsRepository {
  configured(): boolean;
  repo(): string;
  /** Les noms de fichiers (sans `.md`) d'un dossier de contenu. */
  listSlugs(kind: 'videos' | 'products'): Promise<string[]>;
  /** Un seul commit pour tous les fichiers : un seul déploiement du site. */
  commit(files: AylabsFile[], message: string): Promise<string>;
}
