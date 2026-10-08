import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../kernel/auth';
import { badRequest } from '../../kernel/errors';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Type réel du fichier d'après sa signature (on ne fait jamais confiance au nom ni au Content-Type). */
export function sniffImage(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString('ascii', 0, 6))) return { ext: 'gif', mime: 'image/gif' };
  return null;
}

/** Téléversement d'images (cartes, portraits, illustrations) — stockage isolé, nom aléatoire. */
export async function uploadsRoutes(app: FastifyInstance, { uploadDir }: { uploadDir: string }) {
  await mkdir(uploadDir, { recursive: true });

  app.post('/uploads', async (request, reply) => {
    requireUser(request);
    const file = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
    if (!file) throw badRequest('Aucun fichier reçu.');
    const buf = await file.toBuffer().catch(() => {
      throw badRequest('Fichier trop volumineux (8 Mo maximum).');
    });
    if (file.file.truncated) throw badRequest('Fichier trop volumineux (8 Mo maximum).');
    const kind = sniffImage(buf);
    if (!kind) throw badRequest('Seules les images PNG, JPEG, WebP ou GIF sont acceptées.');
    const name = `${randomUUID()}.${kind.ext}`;
    await writeFile(path.join(uploadDir, name), buf);
    return reply.status(201).send({ url: `/uploads/${name}`, mime: kind.mime, size: buf.length });
  });
}
