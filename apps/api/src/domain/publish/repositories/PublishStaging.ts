import type { Readable } from 'node:stream';

/**
 * Un dépôt **éphémère**, hors du studio : Meta ne publie un Reel (ni sa couverture) qu'en
 * allant télécharger le fichier à une adresse publique, et le studio n'en a pas. On y
 * dépose le fichier et on donne à Meta un lien signé. Les fichiers **restent 24 h** (Meta
 * peut les relire jusqu'à la publication), puis `removeOlderThan` les efface. Le studio
 * n'y fait que des connexions sortantes.
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
  /** Efface ce qui, sous `prefix`, est plus vieux que `ageMs`. Rend le nombre effacé. Ne lève jamais. */
  removeOlderThan(prefix: string, ageMs: number): Promise<number>;
}
