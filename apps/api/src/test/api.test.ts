import type { EventDto } from '@ds/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BuiltApp } from '../app';
import { createTestApp, TestClient } from './helpers';

let built: BuiltApp;
let gm: TestClient;
let player: TestClient;
let outsider: TestClient;
let campaignId: string;
let playerId: string;

beforeAll(async () => {
  built = await createTestApp();
  gm = new TestClient(built);
  player = new TestClient(built);
  outsider = new TestClient(built);
  await gm.register('Maelle');
  playerId = (await player.register('Karim')).id;
  await outsider.register('Intrus');
});

afterAll(async () => {
  await built.close();
});

describe('identité', () => {
  it('protège les routes et gère la session par cookie', async () => {
    const anon = new TestClient(built);
    expect((await anon.get('/auth/me')).statusCode).toBe(401);
    expect((await gm.get('/auth/me')).json().user.displayName).toBe('Maelle');
  });

  it('refuse un mauvais mot de passe sans révéler le compte', async () => {
    const c = new TestClient(built);
    const res = await c.post('/auth/login', { email: 'maelle@test.local', password: 'mauvais-mot-de-passe' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toMatch(/incorrect/);
  });

  it('valide les entrées avec les schémas partagés', async () => {
    const res = await new TestClient(built).post('/auth/register', { displayName: 'X', email: 'pas-un-courriel', password: 'court' });
    expect(res.statusCode).toBe(400);
  });
});

describe('campagnes', () => {
  it('crée une campagne, rejoint par code, attribue les rôles', async () => {
    const res = await gm.post('/campaigns', { name: 'Les Cendres de Valombre', synopsis: 'Une cité sous les cendres.', settings: { startLevel: 3 } });
    expect(res.statusCode).toBe(201);
    const campaign = res.json().campaign;
    campaignId = campaign.id;
    expect(campaign.role).toBe('gm');
    expect(campaign.joinCode).toMatch(/^[A-Z2-9]{6}$/);

    const joined = await player.post('/campaigns/join', { code: campaign.joinCode });
    expect(joined.json().campaign.role).toBe('player');
    const seenByPlayer = (await player.get(`/campaigns/${campaignId}`)).json().campaign;
    expect(seenByPlayer.joinCode).toBeNull();
    expect(seenByPlayer.members).toHaveLength(2);
  });

  it('cache l’existence d’une campagne aux non-membres', async () => {
    expect((await outsider.get(`/campaigns/${campaignId}`)).statusCode).toBe(404);
    expect((await outsider.get(`/campaigns/${campaignId}/events`)).statusCode).toBe(404);
  });

  it('réserve la configuration au MJ', async () => {
    expect((await player.patch(`/campaigns/${campaignId}`, { name: 'Piratage' })).statusCode).toBe(403);
    expect((await gm.post(`/campaigns/${campaignId}/sessions`, { title: 'Les cloches muettes' })).statusCode).toBe(201);
  });
});

describe('chronique', () => {
  it('ne donne jamais un événement dm_only à un joueur (CHR-05)', async () => {
    await gm.post(`/campaigns/${campaignId}/events`, { type: 'narrative.discovery', title: 'Le phylactère', visibility: 'gm_only' });
    await gm.post(`/campaigns/${campaignId}/events`, { type: 'narrative.place', title: 'Arrivée à Valombre' });
    const gmTitles = (await gm.get(`/campaigns/${campaignId}/events`)).json().events.map((e: EventDto) => e.title);
    const playerTitles = (await player.get(`/campaigns/${campaignId}/events`)).json().events.map((e: EventDto) => e.title);
    expect(gmTitles).toContain('Le phylactère');
    expect(playerTitles).toContain('Arrivée à Valombre');
    expect(playerTitles).not.toContain('Le phylactère');
    expect((await player.get(`/campaigns/${campaignId}/events?q=phylact`)).json().events).toHaveLength(0);
  });

  it('un joueur ne peut pas créer d’événement réservé au MJ', async () => {
    const res = await player.post(`/campaigns/${campaignId}/events`, { type: 'narrative.note', title: 'Note secrète ?', visibility: 'gm_only' });
    expect(res.json().event.visibility).toBe('players');
  });

  it('est idempotent avec une clé d’idempotence (CHR-01)', async () => {
    const body = { type: 'narrative.note', title: 'Une seule fois', idempotencyKey: 'abc-123' };
    const a = (await gm.post(`/campaigns/${campaignId}/events`, body)).json().event;
    const b = (await gm.post(`/campaigns/${campaignId}/events`, body)).json().event;
    expect(a.id).toBe(b.id);
  });

  it('garantit un ordre total et corrige sans effacer (CHR-11)', async () => {
    const events: EventDto[] = (await gm.get(`/campaigns/${campaignId}/events?limit=500`)).json().events;
    const seqs = events.map((e) => e.seq);
    expect([...seqs].sort((a, b) => b - a)).toEqual(seqs);
    const target = events.find((e) => e.title === 'Arrivée à Valombre')!;
    await gm.post(`/campaigns/${campaignId}/events/${target.id}/corrections`, { title: 'Arrivée à Valombre (de nuit)', reason: 'précision' });
    const after = (await gm.get(`/campaigns/${campaignId}/events?q=Valombre`)).json().events as EventDto[];
    expect(after.find((e) => e.id === target.id)).toMatchObject({ title: 'Arrivée à Valombre (de nuit)', corrected: true });
  });

  it('lance les dés côté serveur et journalise le jet', async () => {
    const res = (await player.post(`/campaigns/${campaignId}/rolls`, { notation: '2d6+3', label: 'Dégâts' })).json();
    expect(res.total).toBeGreaterThanOrEqual(5);
    expect(res.total).toBeLessThanOrEqual(15);
    const dice = (await gm.get(`/campaigns/${campaignId}/events?categories=dice`)).json().events;
    expect(dice[0].id).toBe(res.eventId);
  });
});

describe('personnages', () => {
  let elowenId: string;

  it('crée un PJ à partir du ruleset et émet un événement', async () => {
    const res = await player.post(`/campaigns/${campaignId}/characters`, {
      kind: 'pc', name: 'Elowen', species: 'Elfe', className: 'Rôdeur',
      abilities: { str: 10, dex: 16, con: 14, int: 12, wis: 16, cha: 8 }, skills: ['perception'],
    });
    expect(res.statusCode).toBe(201);
    const c = res.json().character;
    elowenId = c.id;
    expect(c.sheet.level).toBe(3);
    expect(c.derived.passivePerception).toBe(15);
    expect(c.canEdit).toBe(true);
  });

  it('applique les actions de jeu avec les règles et refuse les fiches des autres', async () => {
    const dmg = (await player.post(`/characters/${elowenId}/actions`, { type: 'damage', amount: 5 })).json().character;
    expect(dmg.sheet.hp.current).toBe(dmg.sheet.hp.max - 5);
    expect((await outsider.post(`/characters/${elowenId}/actions`, { type: 'heal', amount: 5 })).statusCode).toBe(404);
    const level = (await gm.post(`/characters/${elowenId}/actions`, { type: 'level_up' })).json().character;
    expect(level.sheet.level).toBe(4);
    const cast = await player.post(`/characters/${elowenId}/actions`, { type: 'cast_spell', spellId: 'inconnu', slotLevel: 1 });
    expect(cast.statusCode).toBe(404);
  });

  it('cache le secret d’un PNJ aux joueurs', async () => {
    const npc = (await gm.post(`/campaigns/${campaignId}/characters`, { kind: 'npc', name: 'Maëlis', npc: { secret: 'A vendu le marteau' }, visibleToPlayers: true })).json().character;
    expect(npc.npc.secret).toBe('A vendu le marteau');
    expect((await player.get(`/characters/${npc.id}`)).json().character.npc.secret).toBe('');
  });

  it('garde les notes privées privées', async () => {
    await player.post(`/characters/${elowenId}/notes`, { title: 'Mon secret', body: '...' });
    await player.post(`/characters/${elowenId}/notes`, { title: 'Partagée', shared: true });
    const mine = (await player.get(`/characters/${elowenId}/notes`)).json().notes;
    const gmView = (await gm.get(`/characters/${elowenId}/notes`)).json().notes;
    expect(mine).toHaveLength(2);
    expect(gmView.map((n: { title: string }) => n.title)).toEqual(['Partagée']);
  });
});

describe('combat', () => {
  let encounterId: string;

  it('prépare une rencontre avec le groupe et masque les PV des monstres aux joueurs', async () => {
    const res = await gm.post(`/campaigns/${campaignId}/encounters`, { name: 'Embuscade', cols: 12, rows: 8 });
    expect(res.statusCode).toBe(201);
    encounterId = res.json().encounter.id;
    await gm.post(`/encounters/${encounterId}/commands`, { type: 'add_monster', monsterId: 'goblin', count: 2 });
    const gmState = (await gm.get(`/encounters/${encounterId}`)).json().encounter.state;
    const playerState = (await player.get(`/encounters/${encounterId}`)).json().encounter.state;
    const gob = Object.values(gmState.combatants).find((c: any) => c.monsterId === 'goblin') as any;
    expect(gob.hp).toBe(7);
    expect(playerState.combatants[gob.id].hp).toBeNull();
    expect(Object.values(playerState.combatants).some((c: any) => c.characterId)).toBe(true);
  });

  it('applique les permissions : le joueur ne contrôle que son pion', async () => {
    const state = (await gm.get(`/encounters/${encounterId}`)).json().encounter.state;
    const mine = Object.values(state.combatants).find((c: any) => c.ownerUserId === playerId) as any;
    const gob = Object.values(state.combatants).find((c: any) => c.monsterId === 'goblin') as any;
    expect((await player.post(`/encounters/${encounterId}/commands`, { type: 'move', combatantId: gob.id, to: { x: 5, y: 5 } })).statusCode).toBe(403);
    expect((await player.post(`/encounters/${encounterId}/commands`, { type: 'move', combatantId: mine.id, to: { x: 1, y: 1 } })).statusCode).toBe(200);
    expect((await player.post(`/encounters/${encounterId}/commands`, { type: 'paint_terrain', cells: [{ x: 0, y: 0 }], terrain: 'wall' })).statusCode).toBe(403);
  });

  it('joue des tours, journalise, et le replay reconstruit l’état (CMB-62)', async () => {
    await gm.post(`/encounters/${encounterId}/commands`, { type: 'start' });
    for (let i = 0; i < 4; i++) await gm.post(`/encounters/${encounterId}/commands`, { type: 'next_turn' });
    const state = (await gm.get(`/encounters/${encounterId}`)).json().encounter.state;
    const gob = Object.values(state.combatants).find((c: any) => c.monsterId === 'goblin') as any;
    await gm.post(`/encounters/${encounterId}/commands`, { type: 'change_hp', combatantId: gob.id, amount: 3, mode: 'damage' });

    const { replayCombat } = await import('@ds/rules');
    const stream = (await gm.get(`/encounters/${encounterId}/events`)).json().events;
    const final = (await gm.get(`/encounters/${encounterId}`)).json().encounter.state;
    expect(replayCombat(stream.map((e: any) => e.event))).toEqual(final);

    const playerStream = (await player.get(`/encounters/${encounterId}/events`)).json().events;
    const hpEvent = playerStream.find((e: any) => e.event.type === 'combat.hp_changed' && e.event.payload.id === gob.id);
    expect(hpEvent.event.payload.amount).toBeNull();
    expect(hpEvent.event.payload.bandAfter).toBe('Blessé');
  });

  it('retrouve « qui a affecté X » via la Chronique', async () => {
    const res = (await gm.get(`/campaigns/${campaignId}/events?categories=combat&target=Gobelin`)).json().events;
    expect(res.length).toBeGreaterThan(0);
  });
});

describe('constellation', () => {
  it('ne montre aux joueurs que les nœuds et liens visibles, si la vue joueur est activée', async () => {
    const a = (await gm.post(`/campaigns/${campaignId}/constellation/nodes`, { kind: 'npc', label: 'Tavernier', playerVisible: true })).json().node;
    const b = (await gm.post(`/campaigns/${campaignId}/constellation/nodes`, { kind: 'faction', label: 'Culte secret' })).json().node;
    await gm.post(`/campaigns/${campaignId}/constellation/links`, { fromId: a.id, toId: b.id, type: 'doit', valence: -2 });
    expect((await player.get(`/campaigns/${campaignId}/constellation`)).json().nodes).toHaveLength(0);
    await gm.patch(`/campaigns/${campaignId}`, { settings: { playerConstellation: true } });
    const view = (await player.get(`/campaigns/${campaignId}/constellation`)).json();
    expect(view.nodes.map((n: { label: string }) => n.label)).not.toContain('Culte secret');
    expect(view.links).toHaveLength(0);
    expect((await player.post(`/campaigns/${campaignId}/constellation/nodes`, { kind: 'free', label: 'X' })).statusCode).toBe(403);
  });
});

describe('sanctuaire', () => {
  it('cherche dans le SRD sans tenir compte des accents', async () => {
    const res = (await player.get('/compendium?q=boule')).json().entries;
    expect(res[0].name).toBe('Boule de feu');
    expect((await player.get('/compendium?kind=monster&q=hibours')).json().entries[0].cr).toBe('3');
  });

  it('forge une création et la donne à un personnage', async () => {
    const creation = (await gm.post('/creations', { kind: 'Arme', name: 'Lame des Cendres', rarity: 'Rare', campaignId })).json().creation;
    const chars = (await gm.get(`/campaigns/${campaignId}/characters`)).json().characters;
    const elowen = chars.find((c: { name: string }) => c.name === 'Elowen');
    const after = (await gm.post(`/creations/${creation.id}/give`, { characterId: elowen.id })).json().character;
    expect(after.sheet.inventory.some((i: { name: string }) => i.name === 'Lame des Cendres')).toBe(true);
  });

  it('expose l’attribution CC-BY du SRD', async () => {
    const r = (await new TestClient(built).get('/rulesets')).json().rulesets[0];
    expect(r.license).toBe('CC-BY-4.0');
    expect(r.attribution).toMatch(/System Reference Document 5\.1/);
  });
});
