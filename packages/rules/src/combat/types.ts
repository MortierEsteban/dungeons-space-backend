export type CombatantKind = 'pc' | 'npc' | 'monster';
export type Side = 'ally' | 'enemy' | 'neutral';

export interface Cell {
  x: number;
  y: number;
}

export interface ConditionState {
  name: string;
  /** Durée restante en rounds ; null = jusqu'à retrait manuel. */
  rounds: number | null;
}

export const HP_BANDS = ['Indemne', 'Blessé', 'Sanglant', 'Agonisant', 'À terre'] as const;
export type HpBand = (typeof HP_BANDS)[number];

export interface QuickAttack {
  name: string;
  bonus: number;
  damage: string;
  damageType: string;
}

export interface TurnResources {
  action: boolean;
  bonus: boolean;
  reaction: boolean;
  /** Mètres déjà parcourus ce tour-ci. */
  movementUsed: number;
}

export interface Combatant {
  id: string;
  name: string;
  short: string;
  kind: CombatantKind;
  side: Side;
  characterId: string | null;
  monsterId: string | null;
  ownerUserId: string | null;
  /** null = masqué pour ce lecteur (vue joueur d'une créature cachée). */
  hp: number | null;
  maxHp: number | null;
  tempHp: number;
  ac: number | null;
  hpBand: HpBand;
  initiative: number | null;
  initiativeMod: number;
  /** Vitesse en mètres. */
  speed: number;
  /** Taille en cases (1 = M, 2 = G…). */
  size: number;
  position: Cell | null;
  conditions: ConditionState[];
  /** Statistiques (PV, CA) masquées aux joueurs. */
  hidden: boolean;
  attack: QuickAttack | null;
  resources: TurnResources;
  /** Portrait affiché sur le jeton (facultatif ; absent des combats antérieurs). */
  portraitUrl?: string | null;
  /** Modèle 3D (glTF binaire) importé par le joueur ou le MJ ; absent = jeton simple. */
  modelUrl?: string | null;
}

export const TERRAIN_KINDS = ['wall', 'difficult', 'water', 'lava', 'vegetation'] as const;
export type TerrainKind = (typeof TERRAIN_KINDS)[number];

export const ZONE_SHAPES = ['circle', 'square', 'cone', 'line'] as const;
export type ZoneShape = (typeof ZONE_SHAPES)[number];

export interface Zone {
  id: string;
  shape: ZoneShape;
  origin: Cell;
  /** Rayon, côté ou longueur en cases. */
  size: number;
  /** Direction 0..7 (E, SE, S, SO, O, NO, N, NE) pour cônes et lignes. */
  direction: number;
  color: string;
  label: string;
}

export const OBJECT_KINDS = ['chest', 'barrel', 'door', 'campfire', 'torch', 'trap', 'altar', 'statue'] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

export interface MapObject {
  id: string;
  kind: ObjectKind;
  position: Cell;
  label: string;
  open: boolean;
  /** Objet secret (piège…) : invisible des joueurs tant qu'il n'est pas révélé. */
  secret: boolean;
  revealed: boolean;
}

export interface BattleMap {
  cols: number;
  rows: number;
  /** Taille d'une case en mètres (1,5 m en D&D 5e). */
  cellMeters: number;
  background: string | null;
  terrain: Record<string, TerrainKind>;
  zones: Zone[];
  objects: MapObject[];
}

export interface CombatSettings {
  /** simple = chaque diagonale coûte 1 case ; alternate = variante 5/10/5. */
  diagonalRule: 'simple' | 'alternate';
  hideMonsterStats: boolean;
}

export interface CombatState {
  id: string;
  name: string;
  status: 'setup' | 'active' | 'ended';
  round: number;
  activeId: string | null;
  combatants: Record<string, Combatant>;
  map: BattleMap;
  settings: CombatSettings;
  /** Nombre d'événements appliqués (sert de version pour la synchro). */
  version: number;
}

export const cellKey = (c: Cell) => `${c.x},${c.y}`;
