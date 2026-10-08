import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE = 'ds_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
/** Au-delà de cet âge, le jeton est renouvelé à la requête suivante (rotation glissante). */
const ROTATE_AFTER_SECONDS = 60 * 60 * 24;

export class TokenService {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  sign(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
      .sign(this.key);
  }

  /** Retourne l'identifiant utilisateur et s'il faut renouveler le jeton, ou null si invalide. */
  async verify(token: string | undefined): Promise<{ userId: string; rotate: boolean } | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      if (!payload.sub) return null;
      const age = Date.now() / 1000 - (payload.iat ?? 0);
      return { userId: payload.sub, rotate: age > ROTATE_AFTER_SECONDS };
    } catch {
      return null;
    }
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}
