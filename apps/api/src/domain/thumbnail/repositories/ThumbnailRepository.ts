import type {
  StoredThumbnailSettings,
  Thumbnail,
  ThumbnailAsset,
  ThumbnailCredentials,
  ThumbnailImage,
} from '../entities/Thumbnail.ts';

export interface ThumbnailRepository {
  settings(): StoredThumbnailSettings;
  updateSettings(patch: Partial<StoredThumbnailSettings>): void;

  listAssets(): ThumbnailAsset[];
  addAsset(label: string, image: ThumbnailImage): ThumbnailAsset;
  assetImage(id: string): ThumbnailImage | null;
  deleteAsset(id: string): boolean;

  /** `saved` : `true` les enregistrées seules, absent ne filtre pas. */
  list(filter?: { productionId?: string; saved?: boolean }): Thumbnail[];
  findById(id: string): Thumbnail | null;
  add(thumbnail: Omit<Thumbnail, 'id' | 'createdAt' | 'savedAt'>, image: ThumbnailImage): Thumbnail;
  /** Enregistre sur une vidéo (`savedAt` posé), ou retire l'enregistrement (`null`). */
  setSaved(
    id: string,
    saved: { productionId: string; title: string | null; savedAt: string } | null,
  ): Thumbnail | null;
  image(id: string): ThumbnailImage | null;
  delete(id: string): boolean;
}

export interface ThumbnailGeneration {
  prompt: string;
  size: string;
  /** Avec des images, l'API d'édition ; sans image, celle de génération. */
  images: ThumbnailImage[];
}

export interface ThumbnailImageClient {
  generate(
    credentials: ThumbnailCredentials,
    generation: ThumbnailGeneration,
  ): Promise<ThumbnailImage>;
}
