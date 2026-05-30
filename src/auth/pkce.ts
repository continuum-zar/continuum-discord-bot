import { createHash, randomBytes } from 'node:crypto';

function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

export function generatePkce(): PkcePair {
  const verifier = base64urlEncode(randomBytes(32));
  const challenge = base64urlEncode(createHash('sha256').update(verifier).digest());
  return { verifier, challenge, method: 'S256' };
}
