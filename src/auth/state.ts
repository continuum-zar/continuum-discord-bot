import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { loadConfig } from '../config.js';

const config = loadConfig();
const secret = new TextEncoder().encode(config.BOT_STATE_SIGNING_KEY);
const STATE_TTL_SECONDS = 10 * 60;

export interface StatePayload {
  discord_user_id: string;
  verifier: string;
  nonce: string;
}

export async function signState(payload: StatePayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS)
    .sign(secret);
}

export class StateVerificationError extends Error {}

export async function verifyState(token: string): Promise<StatePayload> {
  try {
    const { payload } = await jwtVerify(token, secret);
    const { discord_user_id, verifier, nonce } = payload as Record<string, unknown>;
    if (typeof discord_user_id !== 'string' || typeof verifier !== 'string' || typeof nonce !== 'string') {
      throw new StateVerificationError('state payload missing required fields');
    }
    return { discord_user_id, verifier, nonce };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new StateVerificationError('state expired');
    }
    if (err instanceof StateVerificationError) throw err;
    throw new StateVerificationError('invalid state');
  }
}
