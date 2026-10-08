import { loginSchema, registerSchema, updateProfileSchema } from '@ds/shared';
import type { FastifyInstance } from 'fastify';
import { clearSessionCookie, requireUser, setSessionCookie } from '../../kernel/auth';
import { parse, unauthorized } from '../../kernel/errors';
import type { CampaignsService } from '../campaigns/campaigns.service';
import type { IdentityService } from './identity.service';
import type { TokenService } from './tokens';

interface Deps {
  identity: IdentityService;
  campaigns: CampaignsService;
  tokens: TokenService;
  secureCookies: boolean;
}

const authRateLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } };

export async function identityRoutes(app: FastifyInstance, { identity, campaigns, tokens, secureCookies }: Deps) {
  app.post('/auth/register', { config: authRateLimit }, async (request, reply) => {
    const input = parse(registerSchema, request.body);
    const user = await identity.register(input);
    await setSessionCookie(reply, tokens, user.id, secureCookies);
    return reply.status(201).send({ user });
  });

  app.post('/auth/login', { config: authRateLimit }, async (request, reply) => {
    const input = parse(loginSchema, request.body);
    const user = await identity.login(input.email, input.password);
    await setSessionCookie(reply, tokens, user.id, secureCookies);
    return { user };
  });

  app.post('/auth/logout', async (_request, reply) => {
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.get('/auth/me', async (request, reply) => {
    const userId = requireUser(request);
    const user = await identity.get(userId);
    if (!user) {
      clearSessionCookie(reply);
      throw unauthorized();
    }
    return { user };
  });

  app.patch('/auth/me', async (request) => {
    const userId = requireUser(request);
    return { user: await identity.update(userId, parse(updateProfileSchema, request.body)) };
  });

  /** Invitations en attente adressées au courriel de l'utilisateur. */
  app.get('/invitations', async (request) => {
    const userId = requireUser(request);
    const user = await identity.get(userId);
    return { invitations: user ? await campaigns.invitationsFor(user.email) : [] };
  });

  app.post<{ Params: { id: string } }>('/invitations/:id/accept', async (request) => {
    const userId = requireUser(request);
    const user = await identity.get(userId);
    if (!user) throw unauthorized();
    return { campaign: await campaigns.acceptInvitation(request.params.id, user) };
  });
}
