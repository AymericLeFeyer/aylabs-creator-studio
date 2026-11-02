import type { ProductionRepository } from '../../../domain/production/repositories/ProductionRepository.ts';
import type { SecretCipher } from '../../../domain/integration/repositories/IntegrationRepository.ts';
import {
  DEFAULT_THUMBNAIL_MODEL,
  MAX_THUMBNAIL_IMAGES,
  THUMBNAIL_SIZES,
  type GenerateThumbnailInput,
  type Thumbnail,
  type ThumbnailAsset,
  type ThumbnailCredentials,
  type ThumbnailImage,
  type ThumbnailKeySource,
  type ThumbnailSettingsInput,
  type ThumbnailSettingsView,
} from '../../../domain/thumbnail/entities/Thumbnail.ts';
import type {
  ThumbnailImageClient,
  ThumbnailRepository,
} from '../../../domain/thumbnail/repositories/ThumbnailRepository.ts';
import { imageMimeType } from '../../../domain/thumbnail/services/imageType.ts';
import { composeThumbnailPrompt } from '../../../domain/thumbnail/services/prompt.ts';
import { badRequest, conflict, notFound } from '../../../shared/errors.ts';

const KEY_CONTEXT = 'thumbnail:openaiKey';

const toImage = (data: Uint8Array): ThumbnailImage => {
  const mimeType = imageMimeType(data);
  if (!mimeType) throw badRequest('Image PNG, JPEG ou WebP attendue.');
  return { data, mimeType };
};

/**
 * Les miniatures, et le **seul** endroit où la clé d'OpenAI est déchiffrée.
 * `OPENAI_API_KEY` l'emporte toujours sur l'écran.
 */
export class ManageThumbnails {
  private readonly thumbnails: ThumbnailRepository;
  private readonly productions: ProductionRepository;
  private readonly client: ThumbnailImageClient;
  private readonly cipher: SecretCipher;
  private readonly envKey: string | null;

  constructor(
    thumbnails: ThumbnailRepository,
    productions: ProductionRepository,
    client: ThumbnailImageClient,
    cipher: SecretCipher,
    envKey: string | null,
  ) {
    this.thumbnails = thumbnails;
    this.productions = productions;
    this.client = client;
    this.cipher = cipher;
    this.envKey = envKey;
  }

  private storedKey(): string | null {
    const { encryptedApiKey } = this.thumbnails.settings();
    return encryptedApiKey ? this.cipher.decrypt(encryptedApiKey, KEY_CONTEXT) : null;
  }

  private keySource(): ThumbnailKeySource {
    if (this.envKey) return 'env';
    if (!this.thumbnails.settings().encryptedApiKey) return null;
    return this.storedKey() === null ? 'unreadable' : 'app';
  }

  view(): ThumbnailSettingsView {
    const settings = this.thumbnails.settings();
    const keySource = this.keySource();
    return {
      keySource,
      model: settings.model ?? DEFAULT_THUMBNAIL_MODEL,
      quality: settings.quality,
      generalPrompt: settings.generalPrompt,
      secretsKeyConfigured: this.cipher.available,
      configured: keySource === 'env' || keySource === 'app',
    };
  }

  update(input: ThumbnailSettingsInput): ThumbnailSettingsView {
    const { apiKey, model, quality, generalPrompt } = input;
    if (apiKey !== undefined) {
      if (this.envKey) {
        throw conflict('La clé vient de OPENAI_API_KEY : elle se change dans l’environnement.');
      }
      // Jamais de clair : sans SECRETS_KEY, `encrypt` refuse en 409.
      this.thumbnails.updateSettings({
        encryptedApiKey: apiKey ? this.cipher.encrypt(apiKey, KEY_CONTEXT) : null,
      });
    }
    this.thumbnails.updateSettings({
      ...(model !== undefined ? { model: model?.trim() ? model.trim() : null } : {}),
      ...(quality !== undefined ? { quality } : {}),
      ...(generalPrompt !== undefined ? { generalPrompt } : {}),
    });
    return this.view();
  }

  private credentials(): ThumbnailCredentials {
    const apiKey = this.envKey ?? this.storedKey();
    if (!apiKey) {
      throw badRequest('Aucune clé OpenAI : renseigne-la dans Paramètres → API → OpenAI.');
    }
    const { model, quality } = this.thumbnails.settings();
    return { apiKey, model: model ?? DEFAULT_THUMBNAIL_MODEL, quality };
  }

  listAssets(): ThumbnailAsset[] {
    return this.thumbnails.listAssets();
  }

  addAsset(label: string, data: Uint8Array): ThumbnailAsset {
    return this.thumbnails.addAsset(label, toImage(data));
  }

  assetImage(id: string): ThumbnailImage {
    const image = this.thumbnails.assetImage(id);
    if (!image) throw notFound('Image');
    return image;
  }

  deleteAsset(id: string): void {
    if (!this.thumbnails.deleteAsset(id)) throw notFound('Image');
  }

  list(productionId?: string): Thumbnail[] {
    return this.thumbnails.list(productionId);
  }

  image(id: string): ThumbnailImage {
    const image = this.thumbnails.image(id);
    if (!image) throw notFound('Miniature');
    return image;
  }

  delete(id: string): void {
    if (!this.thumbnails.delete(id)) throw notFound('Miniature');
  }

  async generate(input: GenerateThumbnailInput): Promise<Thumbnail> {
    const { productionId, format, prompt, assetIds, images } = input;
    const production = productionId ? this.productions.findById(productionId) : null;
    if (productionId && !production) throw notFound('Vidéo');
    if (!production && !prompt.trim()) {
      throw badRequest('Choisis une vidéo ou écris un prompt.');
    }
    if (assetIds.length + images.length > MAX_THUMBNAIL_IMAGES) {
      throw badRequest(`OpenAI accepte ${MAX_THUMBNAIL_IMAGES} images au maximum.`);
    }

    const credentials = this.credentials();
    const bank = assetIds.map((id) => this.assetImage(id));
    const extras = images.map(toImage);
    const title = production ? production.publishTitle || production.title : null;

    const image = await this.client.generate(credentials, {
      prompt: composeThumbnailPrompt({
        generalPrompt: this.thumbnails.settings().generalPrompt,
        customPrompt: prompt,
        title,
        script: production?.script ?? '',
        format,
        bankImages: bank.length,
        extraImages: extras.length,
      }),
      size: THUMBNAIL_SIZES[format],
      images: [...bank, ...extras],
    });

    return this.thumbnails.add({ productionId, title, format, prompt: prompt.trim() }, image);
  }
}
