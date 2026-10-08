import { describe, expect, it } from 'vitest';
import { sniffImage, sniffModel } from '../modules/uploads/uploads.routes';

/** GLB minimal : en-tête 12 octets + bloc JSON (aligné sur 4 octets). */
function glb(json: object, { version = 2, lengthDelta = 0 } = {}): Buffer {
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const chunk = Buffer.from(text, 'utf8');
  const total = 12 + 8 + chunk.length;
  const head = Buffer.alloc(20);
  head.write('glTF', 0, 'ascii');
  head.writeUInt32LE(version, 4);
  head.writeUInt32LE(total + lengthDelta, 8);
  head.writeUInt32LE(chunk.length, 12);
  head.write('JSON', 16, 'ascii');
  return Buffer.concat([head, chunk]);
}

describe('téléversement de modèles 3D', () => {
  it('reconnaît un GLB autonome', () => {
    expect(sniffModel(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }] }))).toEqual({ ext: 'glb', mime: 'model/gltf-binary' });
  });

  it('refuse les ressources externes, les versions inconnues et les fichiers tronqués', () => {
    expect(sniffModel(glb({ asset: { version: '2.0' }, images: [{ uri: 'https://tracker.example/pixel.png' }] }))).toHaveProperty('error');
    expect(sniffModel(glb({ asset: { version: '2.0' }, buffers: [{ uri: 'scene.bin', byteLength: 4 }] }))).toHaveProperty('error');
    expect(sniffModel(glb({ asset: { version: '1.0' } }, { version: 1 }))).toHaveProperty('error');
    expect(sniffModel(glb({ asset: { version: '2.0' } }, { lengthDelta: 8 }))).toHaveProperty('error');
  });

  it('accepte les données embarquées et ignore ce qui n’est pas un GLB', () => {
    expect(sniffModel(glb({ asset: { version: '2.0' }, images: [{ uri: 'data:image/png;base64,AAAA' }] }))).toHaveProperty('ext', 'glb');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffModel(png)).toBeNull();
    expect(sniffImage(png)).toHaveProperty('ext', 'png');
  });
});
