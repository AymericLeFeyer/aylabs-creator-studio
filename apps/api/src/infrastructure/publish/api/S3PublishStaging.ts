import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PublishStaging } from '../../../domain/publish/repositories/PublishStaging.ts';
import { badRequest, upstream } from '../../../shared/errors.ts';

export interface S3StagingConfig {
  endpoint: string | null;
  bucket: string | null;
  accessKeyId: string | null;
  secretAccessKey: string | null;
  region: string;
}

/**
 * Le dépôt éphémère sur un stockage compatible S3 (Cloudflare R2 par défaut, Backblaze B2,
 * MinIO…). `forcePathStyle` : R2 et la plupart des compatibles n'acceptent pas le nom du
 * bucket en sous-domaine. Le bucket reste **privé** : seuls les liens signés lisent.
 */
export class S3PublishStaging implements PublishStaging {
  readonly configured: boolean;
  private readonly client: S3Client | null;
  private readonly bucket: string;

  constructor(config: S3StagingConfig) {
    const { endpoint, bucket, accessKeyId, secretAccessKey } = config;
    this.configured = Boolean(endpoint && bucket && accessKeyId && secretAccessKey);
    this.bucket = bucket ?? '';
    this.client = this.configured
      ? new S3Client({
          endpoint: endpoint!,
          region: config.region,
          forcePathStyle: true,
          credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
        })
      : null;
  }

  private require(): S3Client {
    if (!this.client) {
      throw badRequest(
        'Stockage de publication absent : renseigne PUBLISH_S3_ENDPOINT, PUBLISH_S3_BUCKET, ' +
          'PUBLISH_S3_ACCESS_KEY_ID et PUBLISH_S3_SECRET_ACCESS_KEY.',
      );
    }
    return this.client;
  }

  async put(
    key: string,
    body: Readable | Uint8Array,
    sizeBytes: number,
    contentType: string,
  ): Promise<void> {
    const client = this.require();
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentLength: sizeBytes,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      throw upstream(
        `Stockage de publication : ${error instanceof Error ? error.message : 'envoi refusé'}`,
      );
    }
  }

  async signedUrl(key: string, seconds: number): Promise<string> {
    const client = this.require();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: seconds,
    });
  }

  async removeOlderThan(prefix: string, ageMs: number): Promise<number> {
    if (!this.client) return 0;
    const limit = Date.now() - ageMs;
    let removed = 0;
    let token: string | undefined;
    try {
      do {
        const page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        for (const object of page.Contents ?? []) {
          if (!object.Key || !object.LastModified) continue;
          if (object.LastModified.getTime() > limit) continue;
          await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: object.Key }));
          removed += 1;
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    } catch (error) {
      console.warn('[publish] nettoyage du stockage éphémère impossible :', error);
    }
    return removed;
  }
}
