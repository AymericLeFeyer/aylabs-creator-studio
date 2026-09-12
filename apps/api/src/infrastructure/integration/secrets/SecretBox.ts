import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import type { SecretCipher } from '../../../domain/integration/repositories/IntegrationRepository.ts';
import { conflict } from '../../../shared/errors.ts';

const VERSION = 'v1';
const MIN_KEY_LENGTH = 16;

/**
 * Chiffre les secrets des intégrations au repos, en AES-256-GCM.
 *
 * **La clé ne vit jamais à côté des données.** Elle vient de `SECRETS_KEY`, dans
 * l'environnement du conteneur, et la base ne contient que des chiffrés : une copie du
 * fichier SQLite ou du volume ne livre aucun mot de passe. Générer une clé dans le volume
 * aurait été plus confortable et ne protégeait de rien — la clé et le coffre seraient
 * partis ensemble.
 *
 * Sans `SECRETS_KEY`, l'écran refuse d'enregistrer un secret : il reste la voie des
 * variables d'environnement, jamais celle d'un secret en clair.
 *
 * Le format `v1:iv:tag:chiffré` porte sa version, pour qu'un changement d'algorithme
 * n'oblige pas à tout ressaisir. `context` (`amazon:password`) est lié au chiffré comme
 * donnée authentifiée : recopier la valeur d'un champ dans un autre la rend illisible.
 */
export class SecretBox implements SecretCipher {
  private readonly key: Buffer | null;

  constructor(secret: string | null) {
    if (secret && secret.length < MIN_KEY_LENGTH) {
      console.warn(
        `[secrets] SECRETS_KEY trop courte (${secret.length} caractères, ${MIN_KEY_LENGTH} minimum) : ignorée`,
      );
    }
    // HKDF plutôt que la chaîne brute : la clé AES fait 32 octets quelle que soit la
    // longueur de ce qu'on a mis dans l'environnement.
    this.key =
      secret && secret.length >= MIN_KEY_LENGTH
        ? Buffer.from(
            hkdfSync('sha256', secret, 'aylabs-creator-studio', 'integration-secrets', 32),
          )
        : null;
  }

  get available(): boolean {
    return this.key !== null;
  }

  encrypt(plain: string, context: string): string {
    if (!this.key) {
      throw conflict(
        'SECRETS_KEY absente : aucun secret ne peut être enregistré depuis l’écran. Renseigne-la, ou passe la valeur par une variable d’environnement.',
      );
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [
      VERSION,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      data.toString('base64'),
    ].join(':');
  }

  decrypt(payload: string, context: string): string | null {
    if (!this.key) return null;
    const [version, iv, tag, data] = payload.split(':');
    if (version !== VERSION || !iv || !tag || data === undefined) return null;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Clé changée ou chiffré altéré : GCM refuse d'authentifier. On ne sait pas
      // lequel des deux, et dans les deux cas la valeur est à ressaisir.
      return null;
    }
  }
}
