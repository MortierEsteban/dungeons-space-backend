import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../kernel/auth';
import { badRequest } from '../../kernel/errors';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Les modèles 3D (glTF binaire, textures embarquées) ont droit à davantage. */
export const MAX_MODEL_BYTES = 32 * 1024 * 1024;

type Sniffed = { ext: string; mime: string };

/** Type réel du fichier d'après sa signature (on ne fait jamais confiance au nom ni au Content-Type). */
export function sniffImage(buf: Buffer): Sniffed | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString('ascii', 0, 6))) return { ext: 'gif', mime: 'image/gif' };
  return null;
}

/**
 * Modèle glTF 2.0 binaire (.glb) autonome : en-tête et premier bloc JSON valides,
 * aucune ressource externe (le navigateur ne doit jamais aller chercher d'URL tierce).
 * Retourne null si ce n'est pas un GLB, ou un message d'erreur s'il est refusé.
 */
export function sniffModel(buf: Buffer): Sniffed | { error: string } | null {
  if (buf.length < 20 || buf.toString('ascii', 0, 4) !== 'glTF') return null;
  if (buf.readUInt32LE(4) !== 2) return { error: 'Seuls les modèles glTF 2.0 sont acceptés.' };
  if (buf.readUInt32LE(8) !== buf.length) return { error: 'Fichier .glb tronqué ou corrompu.' };
  const jsonLength = buf.readUInt32LE(12);
  if (buf.toString('ascii', 16, 20) !== 'JSON' || 20 + jsonLength > buf.length) return { error: 'Fichier .glb corrompu.' };
  let gltf: { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
  try {
    gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLength));
  } catch {
    return { error: 'Fichier .glb corrompu.' };
  }
  const external = [...(gltf.buffers ?? []), ...(gltf.images ?? [])].some((r) => typeof r.uri === 'string' && !r.uri.startsWith('data:'));
  if (external) return { error: 'Le modèle référence des fichiers externes : exportez-le en .glb avec textures embarquées.' };
  return { ext: 'glb', mime: 'model/gltf-binary' };
}

/** Téléversement d'images (cartes, portraits, illustrations) et de modèles 3D — stockage isolé, nom aléatoire. */
export async function uploadsRoutes(app: FastifyInstance, { uploadDir }: { uploadDir: string }) {
  await mkdir(uploadDir, { recursive: true });

  app.post('/uploads', async (request, reply) => {
    requireUser(request);
    const file = await request.file({ limits: { fileSize: MAX_MODEL_BYTES, files: 1 } });
    if (!file) throw badRequest('Aucun fichier reçu.');
    const tooBig = () => badRequest('Fichier trop volumineux (8 Mo pour une image, 32 Mo pour un modèle 3D).');
    const buf = await file.toBuffer().catch(() => {
      throw tooBig();
    });
    if (file.file.truncated) throw tooBig();
    const model = sniffModel(buf);
    if (model && 'error' in model) throw badRequest(model.error);
    const kind = model ?? sniffImage(buf);
    if (!kind) throw badRequest('Seules les images PNG, JPEG, WebP ou GIF et les modèles 3D .glb sont acceptés.');
    if (!model && buf.length > MAX_UPLOAD_BYTES) throw tooBig();
    const name = `${randomUUID()}.${kind.ext}`;
    await writeFile(path.join(uploadDir, name), buf);
    return reply.status(201).send({ url: `/uploads/${name}`, mime: kind.mime, size: buf.length });
  });
}
