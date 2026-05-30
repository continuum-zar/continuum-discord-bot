import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { loadConfig } from '../config.js';

const config = loadConfig();
const KEY = Buffer.from(config.TOKEN_ENCRYPTION_KEY, 'hex');
const ALGO = 'aes-256-gcm';

if (KEY.length !== 32) {
  throw new Error('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes');
}

export interface EncryptedToken {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

export function encryptToken(plaintext: string): EncryptedToken {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

export function decryptToken(enc: EncryptedToken): string {
  const decipher = createDecipheriv(ALGO, KEY, enc.iv);
  decipher.setAuthTag(enc.tag);
  const plaintext = Buffer.concat([decipher.update(enc.ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
