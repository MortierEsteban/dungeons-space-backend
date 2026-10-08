import type { Side } from '@ds/rules';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { cellRandom } from './coords';

/** Teintes de la charte par camp (anneau du jeton, halo au sol). */
export const SIDE_COLOR: Record<Side, string> = { ally: '#4fb3ff', enemy: '#e07aa8', neutral: '#c9a96a' };
const SIDE_FILL: Record<Side, [string, string]> = { ally: ['#2a4670', '#101a2c'], enemy: ['#5a1f3d', '#1f0a16'], neutral: ['#4a3d2a', '#1a140c'] };

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat = false): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

const images = new Map<string, Promise<HTMLImageElement>>();
export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Image illisible : ${url}`));
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}

/**
 * Face supérieure d'un jeton : disque teinté selon le camp, liseré runique or,
 * puis le portrait (recadré en cercle) ou les initiales. Les UV du couvercle d'un
 * cylindre découpent un disque dans le carré : le cercle tombe pile sur le bord.
 */
export function tokenFace(label: string, side: Side, portrait?: HTMLImageElement | null): CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S);
  const [inner, outer] = SIDE_FILL[side];
  const grad = g.createRadialGradient(S * 0.4, S * 0.35, 10, S / 2, S / 2, S / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);

  if (portrait) {
    g.save();
    g.beginPath();
    g.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2);
    g.clip();
    // Recadrage « cover » dans le disque, légèrement remonté : les visages sont en haut des portraits.
    const D = S * 0.8;
    const k = Math.max(D / portrait.width, D / portrait.height);
    const w = portrait.width * k;
    const h = portrait.height * k;
    g.drawImage(portrait, S / 2 - w / 2, S / 2 - D / 2 - (h - D) * 0.2, w, h);
    g.restore();
  } else {
    g.fillStyle = '#f3e6c4';
    g.font = `600 ${label.length > 2 ? 78 : 96}px Cinzel, Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.6)';
    g.shadowBlur = 8;
    g.fillText(label, S / 2, S / 2 + 6);
    g.shadowBlur = 0;
  }

  // Liseré : double cercle or + petites runes (losanges) aux quatre points cardinaux.
  g.strokeStyle = '#c9a96a';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.42, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(232,211,160,.6)';
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.465, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#e8d3a0';
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const x = S / 2 + Math.cos(a) * S * 0.442;
    const y = S / 2 + Math.sin(a) * S * 0.442;
    g.save();
    g.translate(x, y);
    g.rotate(Math.PI / 4);
    g.fillRect(-5, -5, 10, 10);
    g.restore();
  }
  return finish(c);
}

/** Dallage de pierre procédural (carte sans image) : une tuile = 2 × 2 cases, répétée. */
let flagstones: CanvasTexture | null = null;
export function flagstoneTexture(): CanvasTexture {
  if (flagstones) return flagstones;
  const S = 512;
  const [c, g] = canvas(S);
  g.fillStyle = '#18121e';
  g.fillRect(0, 0, S, S);
  const rnd = cellRandom(7, 11);
  const half = S / 2;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      // Chaque case est découpée en 1 à 3 dalles irrégulières.
      const split = rnd() < 0.5;
      const parts = split ? [[0, 0, 1, 0.55], [0, 0.55, 1, 0.45]] : [[0, 0, 1, 1]];
      for (const [px, py, pw, ph] of parts as [number, number, number, number][]) {
        const x = i * half + px * half + 5;
        const y = j * half + py * half + 5;
        const w = pw * half - 10;
        const h = ph * half - 10;
        const l = 17 + rnd() * 9;
        g.fillStyle = `hsl(${270 + rnd() * 20}, ${10 + rnd() * 8}%, ${l}%)`;
        g.beginPath();
        g.roundRect(x, y, w, h, 10);
        g.fill();
        // Grain de la pierre.
        for (let k = 0; k < 140; k++) {
          g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,240,220'},${0.03 + rnd() * 0.05})`;
          g.fillRect(x + rnd() * w, y + rnd() * h, 2 + rnd() * 5, 2 + rnd() * 5);
        }
        // Fissures.
        g.strokeStyle = 'rgba(0,0,0,.35)';
        g.lineWidth = 1.5;
        g.beginPath();
        let cx = x + rnd() * w;
        let cy = y + rnd() * h;
        g.moveTo(cx, cy);
        for (let k = 0; k < 4; k++) {
          cx = Math.min(x + w, Math.max(x, cx + (rnd() - 0.5) * 60));
          cy = Math.min(y + h, Math.max(y, cy + (rnd() - 0.5) * 60));
          g.lineTo(cx, cy);
        }
        g.stroke();
      }
    }
  }
  flagstones = finish(c, true);
  return flagstones;
}

/** Appareil de pierre des murs : moellons décalés, joints sombres. */
let bricks: CanvasTexture | null = null;
export function wallTexture(): Texture {
  if (bricks) return bricks;
  const S = 256;
  const [c, g] = canvas(S);
  g.fillStyle = '#1a1420';
  g.fillRect(0, 0, S, S);
  const rnd = cellRandom(3, 5);
  const rowsN = 4;
  const rh = S / rowsN;
  for (let r = 0; r < rowsN; r++) {
    const shift = r % 2 ? S / 4 : 0;
    for (let k = -1; k < 2; k++) {
      const x = k * (S / 2) + shift + 3;
      g.fillStyle = `hsl(${265 + rnd() * 25}, 10%, ${36 + rnd() * 12}%)`;
      g.fillRect(x, r * rh + 3, S / 2 - 6, rh - 6);
      g.fillStyle = 'rgba(255,255,255,.05)';
      g.fillRect(x, r * rh + 3, S / 2 - 6, 4);
    }
  }
  bricks = finish(c, true);
  return bricks;
}
