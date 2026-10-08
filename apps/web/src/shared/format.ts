export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
export const num = (n: number) => nf.format(n);

export const meters = (m: number) => `${num(m)} m`;

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

const dtf = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
const df = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** « VENDREDI 21H » (charte : libellés en capitales Cinzel). */
export function sessionWhen(iso: string): string {
  return dtf.format(new Date(iso)).replace(':00', 'h').replace(':', 'h').toUpperCase();
}

export const shortDate = (iso: string) => df.format(new Date(iso));

export const RARITY_COLORS: Record<string, string> = {
  Commun: '#a79c8a',
  'Peu commun': '#7cc6ff',
  Rare: '#c9a96a',
  'Très rare': '#e07aa8',
  Légendaire: '#f3e6c4',
};

/** Couleur d'une campagne dérivée de son identifiant (stable). */
export function campaignColor(id: string): string {
  const palette = ['#4fb3ff', '#b9a4e0', '#bfe4ff', '#e07aa8', '#c9a96a', '#8fbf6a'];
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length]!;
}
