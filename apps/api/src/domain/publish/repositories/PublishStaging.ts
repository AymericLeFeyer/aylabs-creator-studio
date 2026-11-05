import type { Readable } from 'node:stream';

/**
 * Un dépôt **public et éphémère**, hors du studio : Meta ne publie un Reel (ni sa
 * couverture) qu'en allant télécharger le fichier à une adresse publique, et le studio n'en
 * a pas. On y dépose le fichier, on donne à Meta un lien signé d'une heure, puis on
 * l'efface. Le studio n'y fait que des connexions sortantes.
 */
export interface PublishStaging {
  readonly configured: boolean;
  put(
    key: string,
    body: Readable | Uint8Array,
    sizeBytes: number,
    contentType: string,
  ): Promise<void>;
  /** Lien de lecture signé, valable `seconds` secondes. */
  signedUrl(key: string, seconds: number): Promise<string>;
  /** Ne lève jamais : un fichier oublié expire de toute façon (règle de cycle de vie). */
  remove(key: string): Promise<void>;
}
