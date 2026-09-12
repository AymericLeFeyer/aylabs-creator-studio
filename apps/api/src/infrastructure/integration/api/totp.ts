import { createHmac } from 'node:crypto';
import { badRequest } from '../../../shared/errors.ts';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Decode = (input: string): Buffer => {
  const clean = input.replace(/[\s=-]/g, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw badRequest('Clé de double authentification invalide (base32 attendu)');
    // Les bits de poids fort débordent et sont tronqués à 32 bits : sans conséquence,
    // seuls les `bits` derniers (moins de 13) sont lus.
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

/**
 * Code TOTP (RFC 6238, HMAC-SHA1, pas de 30 s) à partir de la clé d'une application
 * d'authentification.
 *
 * Écrit à la main plutôt qu'avec `otplib` : vingt lignes au-dessus de `node:crypto`,
 * contre une dépendance pour un seul appel — même parti pris que le service worker.
 */
export const totp = (secret: string, now = Date.now(), digits = 6): string => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, '0');
};
