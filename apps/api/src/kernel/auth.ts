import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, type TokenService } from '../modules/identity/tokens';
import { unauthorized } from './errors';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string | null;
  }
}

/** Lit le cookie de session sur chaque requête ; renouvelle le jeton s'il vieillit. */
export function registerAuth(app: FastifyInstance, tokens: TokenService, secureCookies: boolean): void {
  app.decorateRequest('userId', null);
  app.addHook('onRequest', async (request, reply) => {
    const verified = await tokens.verify(request.cookies[SESSION_COOKIE]);
    request.userId = verified?.userId ?? null;
    if (verified?.rotate) await setSessionCookie(reply, tokens, verified.userId, secureCookies);
  });
}

export async function setSessionCookie(reply: FastifyReply, tokens: TokenService, userId: string, secure: boolean): Promise<void> {
  reply.setCookie(SESSION_COOKIE, await tokens.sign(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Identifiant de l'utilisateur connecté, sinon 401. */
export function requireUser(request: FastifyRequest): string {
  if (!request.userId) throw unauthorized();
  return request.userId;
}
