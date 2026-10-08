import { scoresFromArray, type Dnd5eSheet } from '@ds/rules';
import type { CreateCharacterInput, EntityRef, UserDto } from '@ds/shared';
import { sql } from 'drizzle-orm';
import type { BuiltApp } from './app';
import type { Db } from './infra/db/client';
import { users } from './modules/identity/identity.tables';

/**
 * Données de démonstration (NFR « campagne seed ») : « Les Cendres de Valombre », tirée des maquettes.
 *
 * Comptes de démonstration (environnement local uniquement) :
 *   MJ      : mj@dungeonspace.demo     / valombre-mj
 *   Joueurs : lyra@dungeonspace.demo   / valombre-joueur  (Elowen)
 *             tomas@dungeonspace.demo  / valombre-joueur  (Brakk)
 *             sam@dungeonspace.demo    / valombre-joueur  (Sœur Ilda)
 */
export const DEMO_ACCOUNTS = {
  gm: { email: 'mj@dungeonspace.demo', password: 'valombre-mj', displayName: 'Maëlle' },
  lyra: { email: 'lyra@dungeonspace.demo', password: 'valombre-joueur', displayName: 'Lyra' },
  tomas: { email: 'tomas@dungeonspace.demo', password: 'valombre-joueur', displayName: 'Tomas' },
  sam: { email: 'sam@dungeonspace.demo', password: 'valombre-joueur', displayName: 'Sam' },
  orsane: { email: 'orsane@dungeonspace.demo', password: 'valombre-joueur', displayName: 'Orsane' },
  kael: { email: 'kael@dungeonspace.demo', password: 'valombre-joueur', displayName: 'Kael' },
} as const;

type Services = BuiltApp['services'];

/** Peuple la base si elle est vide ; retourne false si des utilisateurs existent déjà. */
export async function seedDemo(s: Services, db: Db): Promise<boolean> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if ((row?.count ?? 0) > 0) return false;

  const u: Record<keyof typeof DEMO_ACCOUNTS, UserDto> = {} as never;
  for (const [key, acc] of Object.entries(DEMO_ACCOUNTS)) {
    u[key as keyof typeof DEMO_ACCOUNTS] = await s.identity.register({ ...acc, preference: key === 'gm' || key === 'orsane' || key === 'kael' ? 'lead' : 'play' });
  }
  const gm = { userId: u.gm.id, role: 'gm' as const };

  // ── Campagne principale ──
  const camp = await s.campaigns.create(u.gm.id, {
    name: 'Les Cendres de Valombre',
    synopsis: "Une cité engloutie par les cendres d'un volcan éteint depuis mille ans… qui vient de se réveiller.",
    tone: 'Sombre',
    rulesetId: 'dnd5e-srd51',
    coverUrl: null,
    visibility: 'public',
    recruiting: false,
    settings: { startLevel: 5, statMethod: 'roll', variants: { maxCrits: true, safeLongRests: true }, diagonalRule: 'simple', playerConstellation: true },
    invites: [],
  });
  const cid = camp.id;
  const friday = new Date();
  friday.setDate(friday.getDate() + ((5 - friday.getDay() + 7) % 7 || 7));
  friday.setHours(21, 0, 0, 0);
  await s.campaigns.update(cid, gm, { nextSessionAt: friday.toISOString() });
  for (const p of [u.lyra, u.tomas, u.sam]) await s.campaigns.joinByCode(camp.joinCode!, p);

  // ── Personnages ──
  const pc = async (owner: UserDto, input: Omit<Extract<CreateCharacterInput, { kind: 'pc' }>, 'kind'>, patch: (sheet: Dnd5eSheet) => void) => {
    const c = await s.characters.create(cid, { userId: owner.id, role: 'player' }, { kind: 'pc', background: '', alignment: '', skills: [], ...input });
    const sheet = structuredClone(c.sheet!);
    patch(sheet);
    await s.characters.update(c.id, owner.id, { sheet: sheet as unknown as Record<string, unknown> });
    return c;
  };
  const elowen = await pc(u.lyra, { name: 'Elowen Sylvecœur', species: 'Elfe', className: 'Rôdeur', level: 5, background: 'Exilée', alignment: 'Neutre bon', abilities: scoresFromArray([10, 16, 14, 12, 16, 8]), skills: ['stealth', 'perception', 'survival', 'nature'] }, (sh) => {
    sh.hp.current = 38;
    sh.xp = 7200;
    sh.inspiration = true;
    sh.coins = { pc: 14, pa: 32, pe: 0, po: 186, pp: 3 };
    sh.defenses.immunities = ['Sommeil magique'];
    sh.inventory = [
      { id: 'i1', name: 'Arc long', ref: 'longbow', qty: 1, weight: 1, container: 'Équipé', equipped: true, rarity: 'Commun', requiresAttunement: false, attuned: false },
      { id: 'i2', name: 'Épée courte', ref: 'shortsword', qty: 2, weight: 1, container: 'Équipé', equipped: true, rarity: 'Commun', requiresAttunement: false, attuned: false },
      { id: 'i3', name: 'Armure de cuir clouté', ref: 'studded-leather', qty: 1, weight: 6.5, container: 'Équipé', equipped: true, rarity: 'Commun', requiresAttunement: false, attuned: false },
      { id: 'i4', name: 'Cape elfique', ref: 'cloak-of-elvenkind', qty: 1, weight: 0.5, container: 'Équipé', equipped: true, rarity: 'Peu commun', requiresAttunement: true, attuned: true },
      { id: 'i5', name: 'Flèches', ref: 'arrows', qty: 34, weight: 0.05, container: 'Ceinture', equipped: false, rarity: 'Commun', requiresAttunement: false, attuned: false },
      { id: 'i6', name: 'Potion de soins', ref: 'potion-healing', qty: 2, weight: 0.25, container: 'Ceinture', equipped: false, rarity: 'Commun', requiresAttunement: false, attuned: false },
      { id: 'i7', name: 'Corde en soie (15 m)', qty: 1, weight: 2.5, container: 'Sac à dos', equipped: false, rarity: 'Commun', requiresAttunement: false, attuned: false },
      { id: 'i8', name: 'Rations (jour)', ref: 'rations', qty: 5, weight: 1, container: 'Sac à dos', equipped: false, rarity: 'Commun', requiresAttunement: false, attuned: false },
      { id: 'i9', name: 'Carte de la crypte', qty: 1, weight: 0, container: 'Sac à dos', equipped: false, rarity: 'Rare', requiresAttunement: false, attuned: false },
      { id: 'i10', name: 'Anneau de saut', ref: 'ring-of-jumping', qty: 1, weight: 0, container: 'Sac à dos', equipped: false, rarity: 'Peu commun', requiresAttunement: true, attuned: false },
    ];
    sh.armorClass = 16;
    sh.spellcasting!.slots = { 1: { max: 4, used: 2 }, 2: { max: 2, used: 1 } };
    sh.spellcasting!.spells = [
      { id: 's0', ref: 'hunters-mark', name: 'Marque du chasseur', level: 1, school: 'Divination', castingTime: '1 action bonus', range: '27 m', duration: '1 heure', concentration: true, ritual: false, prepared: true, favorite: true, description: 'La cible subit +1d6 dégâts à chaque attaque d’arme qui la touche.', roll: '1d6' },
      { id: 's1', ref: 'cure-wounds', name: 'Soins', level: 1, school: 'Évocation', castingTime: '1 action', range: 'Contact', duration: 'Instantanée', concentration: false, ritual: false, prepared: true, favorite: false, description: 'Une créature touchée récupère 1d8 + modificateur PV.', roll: '1d8+3' },
      { id: 's2', ref: 'longstrider', name: 'Grande foulée', level: 1, school: 'Transmutation', castingTime: '1 action', range: 'Contact', duration: '1 heure', concentration: false, ritual: false, prepared: false, favorite: false, description: 'La vitesse de la cible augmente de 3 m.' },
      { id: 's3', ref: 'speak-with-animals', name: 'Communication avec les animaux', level: 1, school: 'Divination', castingTime: '1 action', range: 'Personnelle', duration: '10 minutes', concentration: false, ritual: true, prepared: false, favorite: false, description: 'Vous comprenez les bêtes et pouvez leur parler.' },
      { id: 's4', ref: 'pass-without-trace', name: 'Passage sans trace', level: 2, school: 'Abjuration', castingTime: '1 action', range: 'Personnelle', duration: '1 heure', concentration: true, ritual: false, prepared: true, favorite: false, description: 'Vous et vos alliés à 9 m gagnez +10 en Discrétion.' },
      { id: 's5', ref: 'barkskin', name: "Peau d'écorce", level: 2, school: 'Transmutation', castingTime: '1 action', range: 'Contact', duration: '1 heure', concentration: true, ritual: false, prepared: false, favorite: false, description: 'La CA de la cible ne peut être inférieure à 16.' },
    ];
    sh.biography = 'Élevée en lisière de la forêt, exilée pour une faute qu’elle refuse de nommer.';
  });
  const brakk = await pc(u.tomas, { name: 'Brakk', species: 'Nain', className: 'Guerrier', level: 5, background: 'Soldat', alignment: 'Loyal neutre', abilities: scoresFromArray([16, 12, 15, 9, 12, 10]), skills: ['athletics', 'intimidation'] }, (sh) => {
    sh.armorClass = 18;
    sh.inventory = [
      { id: 'b1', name: "Hache d'armes", ref: 'battleaxe', qty: 1, weight: 2, container: 'Équipé', equipped: true, rarity: 'Commun', requiresAttunement: false, attuned: false },
      { id: 'b2', name: 'Cotte de mailles', ref: 'chain-mail', qty: 1, weight: 27.5, container: 'Équipé', equipped: true, rarity: 'Commun', requiresAttunement: false, attuned: false },
      { id: 'b3', name: 'Bouclier', ref: 'shield-armor', qty: 1, weight: 3, container: 'Équipé', equipped: true, rarity: 'Commun', requiresAttunement: false, attuned: false },
    ];
  });
  const ilda = await pc(u.sam, { name: 'Sœur Ilda', species: 'Humain', className: 'Clerc', level: 5, background: 'Acolyte', alignment: 'Neutre bon', abilities: scoresFromArray([12, 10, 13, 10, 15, 13]), skills: ['medicine', 'religion'] }, (sh) => {
    sh.hp.current = 22;
    sh.armorClass = 14;
    sh.inventory = [{ id: 'c1', name: "Masse d'armes", ref: 'mace', qty: 1, weight: 2, container: 'Équipé', equipped: true, rarity: 'Commun', requiresAttunement: false, attuned: false }];
  });

  const npc = (name: string, npcData: { species: string; job: string; trait: string; goal: string; secret: string }, visible = true) =>
    s.characters.create(cid, gm, { kind: 'npc', name, npc: { attitude: 'neutre', notes: '', ...npcData }, visibleToPlayers: visible, addToConstellation: true });
  const maelis = await npc('Maëlis Brumefer', { species: 'Naine', job: 'Forgeronne', trait: 'Parle à ses enclumes comme à des enfants.', goal: 'Retrouver le marteau volé de son clan.', secret: 'Elle a elle-même vendu le marteau pour payer une dette.' });
  const fendrel = await npc('Fendrel Corbeval', { species: 'Humain', job: 'Contrebandier', trait: 'Boite de la jambe gauche.', goal: 'Un tiers du trésor de la crypte.', secret: 'Informateur du capitaine des cendres.' });
  const garrick = await npc('Garrick', { species: 'Humain', job: 'Capitaine de la garde', trait: 'Droit comme une hallebarde.', goal: 'Protéger Valombre.', secret: '' });
  const tavernier = await npc('Le Tavernier', { species: 'Halfelin', job: 'Aubergiste', trait: 'Connaît toutes les rumeurs.', goal: 'Que personne ne casse sa vaisselle.', secret: 'Doit de l’argent à Fendrel.' });

  // ── Sessions & Chronique (CHR) ──
  const ref = (c: { id: string; name: string }): EntityRef => ({ kind: 'character', id: c.id, name: c.name });
  const byName: Record<string, EntityRef> = { Elowen: ref(elowen), Brakk: ref(brakk), 'Sœur Ilda': ref(ilda) };
  const authors: Record<string, string> = { MJ: u.gm.id, Tomas: u.tomas.id, Lyra: u.lyra.id, Sam: u.sam.id };
  const TYPE: Record<string, string> = { Lieu: 'narrative.place', Rencontre: 'narrative.encounter', Découverte: 'narrative.discovery', Quête: 'narrative.quest', Combat: 'narrative.combat', Mort: 'narrative.death' };
  const EV: [number, string, string, string, string[], string, EntityRef[]?, boolean?][] = [
    [1, 'Lieu', 'Arrivée à Valombre', 'MJ', ['Elowen', 'Brakk', 'Sœur Ilda'], 'Le groupe atteint la cité sous une pluie de cendres tièdes. Les cloches de la tour sont muettes depuis des années.'],
    [1, 'Rencontre', 'Maëlis Brumefer', 'Tomas', ['Brakk'], "La forgeronne naine accepte de réparer la hache de Brakk en échange d'un service : retrouver le marteau de son clan.", [ref(maelis)]],
    [1, 'Découverte', 'La cloche qui sonne seule', 'Lyra', ['Elowen'], "À minuit, la cloche de la tour a sonné trois coups. Personne n'était dans le clocher."],
    [2, 'Combat', 'Embuscade sur la route des cendres', 'Sam', ['Elowen', 'Brakk', 'Sœur Ilda'], 'Six gobelins attaquent la caravane. Ilda tombe à terre puis se relève grâce à une potion.'],
    [2, 'Quête', 'Le marteau volé', 'Tomas', ['Brakk'], "Les gobelins portaient l'emblème du clan Brumefer. Le marteau est passé entre leurs mains."],
    [2, 'Découverte', 'Carte de la crypte', 'Lyra', ['Elowen'], 'Sur le chef gobelin : une carte annotée de la Crypte des Murmures, sous le volcan.'],
    [3, 'Lieu', 'Le marché noir de Corbeval', 'Sam', ['Sœur Ilda', 'Elowen'], "Un dédale de caves sous la halle aux grains, où l'on vend tout ce qui brûle."],
    [3, 'Rencontre', 'Pacte avec le contrebandier', 'Lyra', ['Elowen'], "Fendrel Corbeval guidera le groupe jusqu'à la crypte contre un tiers du trésor.", [ref(fendrel)]],
    [3, 'Mort', 'Mort de Garrick', 'MJ', ['Brakk'], 'Le capitaine de la garde est retrouvé calciné. Il avait parlé au groupe la veille.', [ref(garrick)]],
    [4, 'Lieu', 'La Crypte des Murmures', 'Sam', ['Elowen', 'Brakk', 'Sœur Ilda'], 'Des milliers de voix chuchotent dans la pierre. Les torches brûlent bleu.'],
    [4, 'Combat', 'Le Hibours gardien', 'Tomas', ['Brakk', 'Elowen'], "Brakk retient la bête pendant qu'Elowen la crible de flèches. Victoire de justesse."],
    [4, 'Découverte', 'Les murmures nomment Elowen', 'Lyra', ['Elowen'], 'Au cœur de la crypte, les voix prononcent son vrai nom — que personne ne connaît.'],
    [5, 'Rencontre', 'Maëlis avoue', 'Tomas', ['Brakk'], 'La forgeronne a vendu elle-même le marteau pour payer une dette. Brakk ne lui pardonne pas.', [ref(maelis)]],
    [5, 'Découverte', 'Le phylactère sous le volcan', 'MJ', [], 'Le marteau sert de sceau au phylactère d’une liche endormie. Le briser la réveillera.', [], true],
    [6, 'Quête', 'Le volcan se réveille', 'MJ', ['Elowen', 'Brakk', 'Sœur Ilda'], "La terre tremble, la cloche sonne sans arrêt. Valombre doit être évacuée avant l'aube."],
    [6, 'Combat', 'Duel contre le capitaine des cendres', 'Sam', ['Sœur Ilda', 'Brakk'], 'Le meurtrier de Garrick se révèle : un chevalier de cendre au service de la liche.'],
  ];
  const TITLES = ['', 'Les cloches muettes', 'La route des cendres', 'Le marché noir', 'La Crypte des Murmures', 'Aveux', 'Le réveil du volcan'];
  const ids: string[] = [];
  for (let session = 1; session <= 6; session++) {
    await s.campaigns.startSession(cid, gm, TITLES[session]!);
    for (const [sNo, type, title, by, chars, text, targets, secret] of EV) {
      if (sNo !== session) continue;
      const row = await s.chronicle.append({
        campaignId: cid,
        type: TYPE[type]!,
        title,
        text,
        visibility: secret ? 'gm_only' : 'players',
        actors: chars.map((c) => byName[c]!),
        targets: targets ?? [],
        source: by === 'MJ' ? 'gm' : 'player',
        authorId: authors[by]!,
        sessionNo: session,
      });
      ids.push(row.id);
    }
    if (session < 6) await s.campaigns.endSession(cid, gm, '');
  }
  await s.chronicle.append({
    campaignId: cid, type: 'social.assaulted', title: 'Brakk assomme le tavernier', text: 'Une bagarre de taverne qui a mal tourné : −3 d’affinité.',
    actors: [ref(brakk)], targets: [ref(tavernier)], source: 'player', authorId: u.tomas.id, sessionNo: 6,
  });
  const LINKS: [number, number][] = [[1, 2], [2, 5], [3, 12], [4, 5], [4, 6], [6, 10], [5, 13], [7, 8], [8, 9], [9, 16], [10, 11], [11, 12], [12, 14], [13, 14], [14, 15], [15, 16], [3, 15], [8, 10], [1, 3]];
  for (const [a, b] of LINKS) await s.chronicle.createLink(cid, gm, ids[a - 1]!, ids[b - 1]!);

  // ── Constellation (CST) ──
  const nodes = (await s.constellation.get(cid, gm, true)).nodes;
  const node = (charId: string) => nodes.find((n) => n.refId === charId)!.id;
  const place = async (label: string, description: string) => (await s.constellation.createNode(cid, gm, { kind: 'place', label, description, refType: null, refId: null, color: null, playerVisible: true })).id;
  const valombre = await place('Valombre', 'La cité sous les cendres.');
  const crypte = await place('Crypte des Murmures', 'Sous le volcan, là où les voix chuchotent.');
  const culte = (await s.constellation.createNode(cid, gm, { kind: 'faction', label: 'Chevaliers de cendre', description: 'Au service de la liche endormie.', refType: null, refId: null, color: null, playerVisible: false })).id;
  const link = (fromId: string, toId: string, type: string, valence: number, intensity: number, note: string, playerVisible = true) =>
    s.constellation.createLink(cid, gm, { fromId, toId, type, valence, intensity, note, playerVisible, reciprocal: false, sourceEventId: null });
  await link(node(brakk.id), node(maelis.id), 'déteste', -3, 4, 'Elle a vendu le marteau de son clan.');
  await link(node(elowen.id), node(fendrel.id), 'connaît', 1, 2, 'Pacte : un tiers du trésor.');
  await link(node(fendrel.id), culte, 'doit', -2, 3, 'Informateur du capitaine des cendres.', false);
  await link(culte, node(garrick.id), 'a causé', -5, 5, 'Le capitaine des cendres a tué Garrick.', false);
  await link(node(maelis.id), valombre, 'se trouve à', 0, 1, 'Sa forge, près de la halle.');
  await link(node(elowen.id), crypte, 'craint', -1, 3, 'Les murmures connaissent son nom.');
  await link(node(tavernier.id), node(fendrel.id), 'doit', -1, 2, 'Une dette de jeu.', false);

  // ── Combat en cours (CMB) ──
  const enc = await s.combat.create(cid, gm, { name: 'La Crypte des Murmures · Salle 2', cols: 24, rows: 15, hideMonsterStats: true, includeParty: true });
  const cmd = (c: unknown) => s.combat.command(enc.id, u.gm.id, c);
  const wall: { x: number; y: number }[] = [];
  for (let y = 0; y < 15; y++) if (y < 5 || y > 9) wall.push({ x: 10, y });
  for (let x = 10; x < 24; x++) wall.push({ x, y: 0 }, { x, y: 14 });
  await cmd({ type: 'paint_terrain', cells: wall, terrain: 'wall' });
  const diff: { x: number; y: number }[] = [];
  for (let x = 12; x < 15; x++) for (let y = 10; y < 13; y++) diff.push({ x, y });
  await cmd({ type: 'paint_terrain', cells: diff, terrain: 'difficult' });
  const water: { x: number; y: number }[] = [];
  for (let x = 19; x < 23; x++) for (let y = 1; y < 4; y++) water.push({ x, y });
  await cmd({ type: 'paint_terrain', cells: water, terrain: 'water' });
  await cmd({ type: 'add_zone', shape: 'circle', origin: { x: 16, y: 3 }, size: 1, direction: 0, color: '#7cc6ff', label: "Toile d'araignée" });
  for (const [kind, x, y] of [['chest', 21, 11], ['barrel', 8, 3], ['campfire', 5, 11], ['trap', 12, 7], ['torch', 11, 2], ['door', 10, 7]] as const) {
    await cmd({ type: 'add_object', kind, position: { x, y } });
  }
  const state = (await s.combat.get(enc.id, u.gm.id)).state;
  const place3 = [{ x: 4, y: 8 }, { x: 6, y: 6 }, { x: 3, y: 6 }];
  for (const [i, c] of Object.values(state.combatants).entries()) await cmd({ type: 'move', combatantId: c.id, to: place3[i] ?? { x: 2, y: 2 + i } });
  await cmd({ type: 'add_monster', monsterId: 'goblin', count: 2, position: { x: 13, y: 6 } });
  await cmd({ type: 'add_monster', monsterId: 'owlbear', count: 1, position: { x: 18, y: 6 } });
  await cmd({ type: 'start' });

  // ── Sanctuaire : créations du MJ ──
  await s.compendium.create(u.gm.id, {
    kind: 'Arme', name: 'Lame des Cendres', rarity: 'Rare', attune: true, weight: 1.5, price: 2500,
    mech: { n: 1, f: 8, dtype: 'Tranchant', bonus: 1, props: ['Polyvalente', 'Finesse'] }, frame: 'Orné', halo: true, tint: null, imageUrl: null,
    effects: [
      { id: 'f1', mode: 'Passif', trigger: 'Quand harmonisé', kind: 'Résistance', value: 'Feu', charges: 0, recharge: 'Aube', desc: '' },
      { id: 'f2', mode: 'Actif', trigger: 'Action bonus', kind: 'Dégâts supplémentaires', value: '2d6 feu', charges: 3, recharge: 'Aube', desc: "La lame s'embrase jusqu'à la fin de votre tour." },
    ],
    lore: 'Forgée dans la lave du volcan de Valombre, elle murmure le nom de son premier porteur quand on la dégaine.',
    campaignId: cid,
    shared: true,
  });
  await s.compendium.create(u.gm.id, {
    kind: 'Objet merveilleux', name: 'Cloche de Valombre', rarity: 'Très rare', attune: true, weight: 2, price: 8000,
    mech: { slot: 'Main', conso: false }, frame: 'Runique', halo: false, tint: '#7cc6ff', imageUrl: null,
    effects: [{ id: 'f3', mode: 'Actif', trigger: 'Action', kind: 'Condition infligée', value: 'Effrayé, JS Sag DD 15', charges: 1, recharge: 'Aube', desc: 'Tous les morts-vivants à 9 m doivent fuir.' }],
    lore: 'Elle sonne seule à minuit, trois coups.',
    campaignId: cid,
    shared: true,
  });

  // ── Notes d'Elowen ──
  await s.characters.createNote(elowen.id, u.lyra.id, { title: 'Le vrai nom', body: "Les murmures de la crypte connaissaient mon nom de naissance. Seule ma mère le connaissait. Qui leur a dit ?\n\nÀ demander à Ilda : un rituel pour faire taire les voix ?", pinned: true, shared: false });
  await s.characters.createNote(elowen.id, u.lyra.id, { title: 'Fendrel Corbeval', body: 'Contrebandier. Nous guide contre un tiers du trésor. Ne pas lui tourner le dos. Il boite de la jambe gauche — blessure récente ?', pinned: false, shared: true });

  // ── Autres campagnes publiques (Explorer) ──
  const other = async (owner: UserDto, name: string, synopsis: string, tone: 'Héroïque' | 'Mystère' | 'Sombre', recruiting: boolean, level: number) =>
    s.campaigns.create(owner.id, { name, synopsis, tone, rulesetId: 'dnd5e-srd51', coverUrl: null, visibility: 'public', recruiting, settings: { startLevel: level, statMethod: 'point_buy', variants: {}, diagonalRule: 'simple', playerConstellation: false }, invites: [] });
  const lucioles = await other(u.orsane, 'La Forêt des Lucioles', 'Un bois enchanté où les sentiers changent à chaque lune.', 'Mystère', true, 1);
  await s.campaigns.joinByCode(lucioles.joinCode!, u.lyra);
  const givre = await other(u.kael, 'Le Trône de Givre', 'Intrigues de cour dans un royaume figé par un hiver sans fin.', 'Héroïque', true, 3);
  const encre = await other(u.orsane, "Sous la Mer d'Encre", "L'expédition qui a réveillé le Léviathan.", 'Sombre', false, 12);
  await s.campaigns.update(encre.id, { userId: u.orsane.id, role: 'gm' }, { status: 'finished' });

  // ── Bibliothèque partagée : créations publiées depuis d'autres tables ──
  const share = (owner: UserDto, campaignId: string, c: Omit<Parameters<typeof s.compendium.create>[1], 'campaignId' | 'shared' | 'frame' | 'halo' | 'tint' | 'imageUrl' | 'attune' | 'weight' | 'price' | 'rarity' | 'lore' | 'effects'> & Partial<Parameters<typeof s.compendium.create>[1]>) =>
    s.compendium.create(owner.id, { rarity: 'Peu commun', attune: false, weight: 0, price: 0, frame: 'Runique', halo: false, tint: null, imageUrl: null, effects: [], lore: '', ...c, campaignId, shared: true });
  await share(u.orsane, lucioles.id, {
    kind: 'Classe', name: 'Lame runique', lore: 'Des guerriers qui gravent la magie du givre dans leur propre chair.',
    mech: {
      hitDie: 10, primary: ['str', 'int'], saves: ['str', 'int'], caster: 'third', spellAbility: 'int',
      skillChoices: { count: 2, from: ['arcana', 'athletics', 'history', 'intimidation', 'perception'] },
      features: [
        { level: 1, name: 'Peau de rune', summary: 'Vos runes vous protègent du froid.', effects: [{ type: 'resistance', damage: 'froid' }] },
        { level: 1, name: 'Frappe runique', summary: 'Dépensez une charge runique : +1d6 dégâts de froid sur un coup au but.' },
        { level: 2, name: 'Garde de givre', summary: 'Tant que vous portez une armure, +1 à la CA.', effects: [{ type: 'ac_bonus', value: 1 }] },
        { level: 5, name: 'Attaque supplémentaire', summary: "Deux attaques lorsque vous effectuez l'action Attaquer." },
      ],
      resources: [{ id: 'runes', name: 'Charges runiques', max: 'pb', recharge: 'short', fromLevel: 1, pool: false }],
    },
  });
  await share(u.orsane, lucioles.id, {
    kind: 'Potion', name: 'Rosée de luciole', rarity: 'Commun', weight: 0.5, price: 60, mech: { n: 2, f: 4, mod: 2, ptype: 'Soins' },
    lore: 'Une goutte de lumière qui referme les plaies.',
  });
  await share(u.orsane, lucioles.id, {
    kind: 'Objet merveilleux', name: 'Cape des sous-bois', rarity: 'Rare', attune: true, weight: 1, price: 1200, mech: { slot: 'Épaules', conso: false },
    effects: [{ id: 'c1', mode: 'Passif', trigger: 'Quand harmonisé', kind: 'Résistance', value: 'Poison', charges: 0, recharge: 'Aube', desc: '' }],
    lore: 'Tissée de mousse et de fils d’araignée.',
  });
  await share(u.kael, givre.id, {
    kind: 'Sort', name: 'Vague d’encre', rarity: 'Rare',
    mech: { lvl: 2, school: 'Invocation', cast: '1 action', range: '18 m', dur: 'Instantanée', comps: ['V', 'S'], conc: false, ritual: false, dice: '3d8', dtype: 'nécrotique', save: 'con', half: true, area: 'sphere', areaSize: 3, condition: 'Aveuglé' },
    lore: 'Une marée noire jaillit et aveugle ceux qu’elle touche.',
  });
  return true;
}

// Exécution directe : `npm run seed` (base configurée par l'environnement).
if (process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1])) {
  const { buildApp } = await import('./app');
  const { loadConfig } = await import('./config');
  const built = await buildApp({ ...loadConfig(), logLevel: 'warn' }, { realtime: 'none' });
  const done = await seedDemo(built.services, built.database.db);
  console.log(done ? 'Campagne de démonstration créée.' : 'Base déjà peuplée : rien à faire.');
  await built.close();
}
