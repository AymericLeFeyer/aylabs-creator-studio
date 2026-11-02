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

  list(productionId?: string): Thumbnail[];
  add(thumbnail: Omit<Thumbnail, 'id' | 'createdAt'>, image: ThumbnailImage): Thumbnail;
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
