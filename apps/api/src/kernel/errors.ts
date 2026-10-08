import { CombatRuleError, DiceNotationError } from '@ds/rules';
import type { ApiErrorBody } from '@ds/shared';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, type ZodType } from 'zod';

type Code = ApiErrorBody['error']['code'];

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: Code,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Veuillez franchir le portail (connexion requise).') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = "Vous n'avez pas les droits pour cette action.") => new AppError(403, 'forbidden', message);
export const notFound = (message = 'Introuvable.') => new AppError(404, 'not_found', message);
export const conflict = (message: string) => new AppError(409, 'conflict', message);

/** Valide une entrée avec un schéma Zod partagé ; lève une 400 lisible en cas d'échec. */
export function parse<T extends ZodType>(schema: T, input: unknown): ReturnType<T['parse']> {
  return schema.parse(input ?? {}) as ReturnType<T['parse']>;
}

function body(code: Code, message: string, details?: unknown): ApiErrorBody {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export function errorHandler(err: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (err instanceof AppError) return reply.status(err.status).send(body(err.code, err.message, err.details));
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return reply.status(400).send(body('bad_request', first ? first.message : 'Requête invalide.', err.issues));
  }
  if (err instanceof CombatRuleError) {
    const status = err.code === 'forbidden' ? 403 : err.code === 'not_found' ? 404 : 400;
    return reply.status(status).send(body(status === 403 ? 'forbidden' : status === 404 ? 'not_found' : 'bad_request', err.message));
  }
  if (err instanceof DiceNotationError) return reply.status(400).send(body('bad_request', err.message));
  const fe = err as FastifyError;
  if (fe.statusCode === 429) return reply.status(429).send(body('rate_limited', 'Trop de tentatives, patientez un instant.'));
  if (fe.statusCode && fe.statusCode < 500) return reply.status(fe.statusCode).send(body('bad_request', fe.message));
  request.log.error({ err }, 'Erreur inattendue');
  return reply.status(500).send(body('internal', 'Un sortilège a mal tourné. Réessayez dans un instant.'));
}
