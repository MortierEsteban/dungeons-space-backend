import type { LinkDto, NodeDto } from '@ds/shared';
import type { Vec3 } from '../../shared/graph/Graph3D';

/** Pseudo-aléatoire stable dérivé de l'identifiant (même disposition à chaque visite). */
function hash(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000 - 0.5;
}

/**
 * Disposition force-directed en 3D (répulsion entre nœuds, ressorts sur les liens, gravité centrale).
 * Les nœuds épinglés (CST-12) gardent leur position. Le nombre d'itérations décroît avec la taille.
 */
export function forceLayout(nodes: NodeDto[], links: LinkDto[], flat = false): Map<string, Vec3> {
  const pos = new Map<string, Vec3>();
  const radius = 120 + Math.sqrt(nodes.length) * 40;
  for (const n of nodes) {
    pos.set(n.id, n.pinned && n.position ? { ...n.position } : { x: hash(n.id, 1) * radius * 2, y: hash(n.id, 2) * radius * 2, z: flat ? 0 : hash(n.id, 3) * radius * 2 });
  }
  const ids = nodes.map((n) => n.id);
  const pinned = new Set(nodes.filter((n) => n.pinned && n.position).map((n) => n.id));
  const iterations = nodes.length > 300 ? 60 : nodes.length > 120 ? 120 : 260;
  const k = 140;
  for (let it = 0; it < iterations; it++) {
    const cooling = 1 - it / iterations;
    const disp = new Map<string, Vec3>(ids.map((id) => [id, { x: 0, y: 0, z: 0 }]));
    for (let i = 0; i < ids.length; i++) {
      const a = pos.get(ids[i]!)!;
      for (let j = i + 1; j < ids.length; j++) {
        const b = pos.get(ids[j]!)!;
        let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1) {
          dx = 1; dy = 0; dz = 0; d2 = 1;
        }
        const f = (k * k) / d2;
        const da = disp.get(ids[i]!)!, db = disp.get(ids[j]!)!;
        da.x += dx * f * 0.05; da.y += dy * f * 0.05; da.z += dz * f * 0.05;
        db.x -= dx * f * 0.05; db.y -= dy * f * 0.05; db.z -= dz * f * 0.05;
      }
    }
    for (const l of links) {
      const a = pos.get(l.fromId), b = pos.get(l.toId);
      if (!a || !b) continue;
      const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const f = ((d - k) / d) * 0.08;
      const da = disp.get(l.fromId)!, db = disp.get(l.toId)!;
      da.x -= dx * f; da.y -= dy * f; da.z -= dz * f;
      db.x += dx * f; db.y += dy * f; db.z += dz * f;
    }
    for (const id of ids) {
      if (pinned.has(id)) continue;
      const p = pos.get(id)!, d = disp.get(id)!;
      d.x -= p.x * 0.01; d.y -= p.y * 0.01; d.z -= p.z * 0.01;
      const len = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z) || 1;
      const step = Math.min(len, 30 * cooling + 2);
      p.x += (d.x / len) * step;
      p.y += (d.y / len) * step;
      p.z = flat ? 0 : p.z + (d.z / len) * step;
    }
  }
  return pos;
}

export function valenceColor(v: number): string {
  if (v <= -1) return v <= -3 ? '#b0306a' : '#e07aa8';
  if (v >= 1) return v >= 3 ? '#4fb3ff' : '#7cc6ff';
  return '#c9a96a';
}
