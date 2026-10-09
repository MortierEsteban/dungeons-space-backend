import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { EventDto, RecordingDto, TranscriptSegmentInput } from '@ds/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type BuiltApp } from '../app';
import { testConfig } from '../config';
import type { AnalysisContext, AnalysisResult, ProposedEvent, SessionAnalyzer } from '../modules/recording/analyzer';
import { TestClient } from './helpers';

/** Analyseur factice : rejoue des réponses programmées et garde les contextes reçus. */
class FakeAnalyzer implements SessionAnalyzer {
  readonly model = 'fake-model';
  readonly calls: AnalysisContext[] = [];
  next: ((c: AnalysisContext) => ProposedEvent[]) | Error = () => [];

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    this.calls.push(context);
    if (this.next instanceof Error) throw this.next;
    return { events: this.next(context), model: this.model, usage: { inputTokens: 100, outputTokens: 20 } };
  }
}

const proposal = (patch: Partial<ProposedEvent>): ProposedEvent => ({
  type: 'narrative.encounter',
  title: 'Rencontre',
  text: '',
  importance: 2,
  gmOnly: false,
  actors: [],
  targets: [],
  places: [],
  inGameDate: null,
  fromSeq: 1,
  toSeq: 1,
  confidence: 0.9,
  relatedEventIds: [],
  ...patch,
});

const words = (n: number) => Array.from({ length: n }, (_, i) => `mot${i}`).join(' ');

let built: BuiltApp;
let gm: TestClient;
let player: TestClient;
let analyzer: FakeAnalyzer;
let dataDir: string;
let campaignId: string;
let corvinId: string;
let recording: RecordingDto;
const DEVICE = 'device-gm-portable';

const segs = (from: number, texts: string[]): TranscriptSegmentInput[] => texts.map((text, k) => ({ clientSeq: from + k, text, ageMs: 1000 * (texts.length - k), durationMs: 900 }));
const settingsWith = async (recordingSettings: Record<string, unknown>) => {
  const current = (await gm.get(`/campaigns/${campaignId}`)).json().campaign.settings;
  const res = await gm.patch(`/campaigns/${campaignId}`, { settings: { ...current, recording: { ...current.recording, ...recordingSettings } } });
  expect(res.statusCode).toBe(200);
};

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'ds-recording-'));
  analyzer = new FakeAnalyzer();
  built = await buildApp(testConfig({ dataDir, uploadDir: path.join(dataDir, 'uploads') }), { realtime: 'none', analyzer });
  gm = new TestClient(built);
  player = new TestClient(built);
  await gm.register('Maelle');
  await player.register('Karim');
  const campaign = (await gm.post('/campaigns', { name: 'Les Cendres de Valombre' })).json().campaign;
  campaignId = campaign.id;
  await player.post('/campaigns/join', { code: campaign.joinCode });
  corvinId = (await gm.post(`/campaigns/${campaignId}/characters`, { kind: 'npc', name: 'Maître Corvin', visibleToPlayers: true })).json().character.id;
});

afterAll(async () => {
  await built.close();
  await rm(dataDir, { recursive: true, force: true });
});

describe('cycle de vie de l’enregistrement', () => {
  it('est désactivé par défaut et exige une session ouverte', async () => {
    expect((await gm.post(`/campaigns/${campaignId}/recordings`, { deviceId: DEVICE })).statusCode).toBe(400);
    await settingsWith({ enabled: true });
    const res = await gm.post(`/campaigns/${campaignId}/recordings`, { deviceId: DEVICE });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/session/);
  });

  it('démarre avec la session, réservé au MJ, visible de toute la table', async () => {
    await gm.post(`/campaigns/${campaignId}/sessions`, { title: 'La crypte' });
    expect((await player.post(`/campaigns/${campaignId}/recordings`, { deviceId: 'device-player' })).statusCode).toBe(403);
    const res = await gm.post(`/campaigns/${campaignId}/recordings`, { deviceId: DEVICE });
    expect(res.statusCode).toBe(201);
    recording = res.json().recording;
    expect(recording).toMatchObject({ sessionNo: 1, status: 'live', deviceId: DEVICE, nextClientSeq: 0 });
    expect(recording.analysis.available).toBe(true);

    const live = (await player.get(`/campaigns/${campaignId}/recordings/live`)).json().recording;
    expect(live.id).toBe(recording.id);
    expect(live.deviceId).toBeNull();
  });

  it('un seul appareil enregistre à la fois, sauf reprise explicite', async () => {
    const other = await gm.post(`/campaigns/${campaignId}/recordings`, { deviceId: 'device-gm-tablette' });
    expect(other.statusCode).toBe(409);
    const takeover = await gm.post(`/campaigns/${campaignId}/recordings`, { deviceId: 'device-gm-tablette', takeover: true });
    expect(takeover.json().recording.id).toBe(recording.id);
    expect((await gm.post(`/campaigns/${campaignId}/recordings/${recording.id}/segments`, { deviceId: DEVICE, segments: segs(0, ['bonjour']) })).statusCode).toBe(409);
    expect((await gm.post(`/campaigns/${campaignId}/recordings`, { deviceId: DEVICE, takeover: true })).statusCode).toBe(201);
  });
});

describe('transcription', () => {
  it('ajoute les segments sans doublon et reprend la numérotation de l’appareil', async () => {
    const batch = segs(0, ['Vous entrez dans la crypte', 'Maître Corvin vous attend']);
    const first = await gm.post(`/campaigns/${campaignId}/recordings/${recording.id}/segments`, { deviceId: DEVICE, segments: batch });
    expect(first.statusCode).toBe(200);
    expect(first.json().accepted).toBe(2);
    const again = (await gm.post(`/campaigns/${campaignId}/recordings/${recording.id}/segments`, { deviceId: DEVICE, segments: batch })).json();
    expect(again.accepted).toBe(0);
    expect(again.recording).toMatchObject({ segmentCount: 2, wordCount: 9, nextClientSeq: 2 });
    expect(again.recording.analysis.pendingWords).toBe(9);
  });

  it('réserve la transcription au MJ, sauf si la table l’ouvre aux joueurs', async () => {
    const page = (await gm.get(`/campaigns/${campaignId}/sessions/1/transcript`)).json();
    expect(page.segments.map((s: { seq: number }) => s.seq)).toEqual([1, 2]);
    expect(page.segments[0].analyzed).toBe(false);
    expect((await player.get(`/campaigns/${campaignId}/sessions/1/transcript`)).statusCode).toBe(403);
    await settingsWith({ playersSeeTranscript: true });
    expect((await player.get(`/campaigns/${campaignId}/sessions/1/transcript`)).statusCode).toBe(200);
    await settingsWith({ playersSeeTranscript: false });
  });
});

describe('analyse par le modèle de langage', () => {
  it('crée les événements dans la Chronique, reliés aux entités connues', async () => {
    analyzer.next = (c) => [
      proposal({
        type: 'narrative.encounter',
        title: 'Les héros rencontrent Maître Corvin',
        text: 'Dans la crypte, Corvin attendait les héros.',
        importance: 3,
        actors: [{ kind: 'free', id: null, name: 'Les héros' }],
        targets: [
          { kind: 'character', id: corvinId, name: 'Maître Corvin' },
          { kind: 'spectre', id: '00000000-0000-0000-0000-000000000000', name: 'Fantôme' },
        ],
        places: ['Crypte de Valombre'],
        fromSeq: c.segments[0]!.seq,
        toSeq: c.segments[1]!.seq,
        confidence: 0.85,
      }),
      proposal({ type: 'narrative.secret', title: 'Corvin cache un pacte', gmOnly: true, importance: 9, fromSeq: 99, toSeq: 120 }),
      proposal({ title: 'Peut-être une rencontre', confidence: 0.1 }),
    ];
    const res = await gm.post(`/campaigns/${campaignId}/recordings/${recording.id}/analyze`);
    expect(res.statusCode).toBe(200);
    expect(res.json().created).toBe(2);
    expect(res.json().recording.analysis).toMatchObject({ analyzedSeq: 2, pendingWords: 0, eventsCreated: 2, lastError: null });

    const ctx = analyzer.calls.at(-1)!;
    expect(ctx.characters.some((c) => c.id === corvinId)).toBe(true);
    expect(ctx.segments.map((s) => s.text)).toEqual(['Vous entrez dans la crypte', 'Maître Corvin vous attend']);

    const events: EventDto[] = (await gm.get(`/campaigns/${campaignId}/events?origin=recording`)).json().events;
    expect(events).toHaveLength(2);
    const encounter = events.find((e) => e.type === 'narrative.encounter')!;
    expect(encounter).toMatchObject({ sessionNo: 1, source: 'system', importance: 3, visibility: 'players', places: ['Crypte de Valombre'] });
    expect(encounter.payload).toMatchObject({ origin: 'recording', recordingId: recording.id, segments: [1, 2], confidence: 0.85 });
    expect(encounter.targets).toEqual([
      { kind: 'character', id: corvinId, name: 'Maître Corvin' },
      { kind: 'free', id: null, name: 'Fantôme' },
    ]);
    const note = events.find((e) => e.type === 'narrative.note')!;
    expect(note).toMatchObject({ visibility: 'gm_only', importance: 5 });
    expect(note.payload.segments).toEqual([2, 2]);

    const forPlayer: EventDto[] = (await player.get(`/campaigns/${campaignId}/events?origin=recording`)).json().events;
    expect(forPlayer.map((e) => e.type)).toEqual(['narrative.encounter']);
    const manual: EventDto[] = (await gm.get(`/campaigns/${campaignId}/events?origin=manual`)).json().events;
    expect(manual.every((e) => e.payload.origin !== 'recording')).toBe(true);
  });

  it('ne réanalyse pas ce qui l’a déjà été, et relie les suites aux événements récents', async () => {
    expect((await gm.post(`/campaigns/${campaignId}/recordings/${recording.id}/analyze`)).json().created).toBe(0);
    const before = analyzer.calls.length;
    analyzer.next = (c) => [proposal({ type: 'social.promised', title: 'Corvin promet son aide', relatedEventIds: c.recentEvents.map((e) => e.id), fromSeq: c.segments[0]!.seq, toSeq: c.segments[0]!.seq })];
    // Sous le seuil de mots : pas d'analyse automatique.
    await gm.post(`/campaigns/${campaignId}/recordings/${recording.id}/segments`, { deviceId: DEVICE, segments: segs(2, ['Corvin promet']) });
    await built.services.recording.drain();
    expect(analyzer.calls.length).toBe(before);
    // Au-delà du seuil (40 mots en test) : l'analyse part d'elle-même, avec la fin déjà analysée en contexte.
    await gm.post(`/campaigns/${campaignId}/recordings/${recording.id}/segments`, { deviceId: DEVICE, segments: segs(3, [words(45)]) });
    await built.services.recording.drain();
    expect(analyzer.calls.length).toBe(before + 1);
    const ctx = analyzer.calls.at(-1)!;
    expect(ctx.previous.map((s) => s.seq)).toEqual([1, 2]);
    expect(ctx.segments.map((s) => s.seq)).toEqual([3, 4]);
    expect(ctx.recentEvents.map((e) => e.title)).toContain('Les héros rencontrent Maître Corvin');
    const links = (await gm.get(`/campaigns/${campaignId}/event-links`)).json().links;
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it('retente une fenêtre en échec, puis l’abandonne sans bloquer la suite', async () => {
    analyzer.next = new Error('Surcharge du service');
    await gm.post(`/campaigns/${campaignId}/recordings/${recording.id}/segments`, { deviceId: DEVICE, segments: segs(4, ['Le plafond s’effondre']) });
    for (let i = 0; i < 2; i++) {
      const r = (await gm.post(`/campaigns/${campaignId}/recordings/${recording.id}/analyze`)).json().recording;
      expect(r.analysis.lastError).toMatch(/Surcharge/);
      expect(r.analysis.analyzedSeq).toBe(4);
    }
    const r = (await gm.post(`/campaigns/${campaignId}/recordings/${recording.id}/analyze`)).json().recording;
    expect(r.analysis.analyzedSeq).toBe(5);
    expect(r.analysis.lastError).toMatch(/Surcharge/);
    analyzer.next = () => [];
  });
});

describe('archive audio', () => {
  it('n’accepte l’audio que si la campagne le conserve, morceau par morceau, dans l’ordre', async () => {
    const put = (index: number, body: string) =>
      built.app.inject({
        method: 'PUT',
        url: `/api/campaigns/${campaignId}/recordings/${recording.id}/audio/${index}?deviceId=${DEVICE}`,
        headers: { cookie: (gm as unknown as { cookie: string }).cookie, 'content-type': 'audio/webm;codecs=opus' },
        payload: Buffer.from(body),
      });
    expect((await put(0, 'AAAA')).statusCode).toBe(400);
    await settingsWith({ keepAudio: true });
    expect((await put(0, 'AAAA')).json().chunks).toBe(1);
    expect((await put(0, 'AAAA')).json().chunks).toBe(1);
    expect((await put(2, 'CCCC')).statusCode).toBe(409);
    expect((await put(1, 'BBBB')).json().chunks).toBe(2);

    const full = await gm.get(`/campaigns/${campaignId}/recordings/${recording.id}/audio`);
    expect(full.statusCode).toBe(200);
    expect(full.headers['content-type']).toBe('audio/webm');
    expect(full.body).toBe('AAAABBBB');
    const partial = await built.app.inject({
      method: 'GET',
      url: `/api/campaigns/${campaignId}/recordings/${recording.id}/audio`,
      headers: { cookie: (gm as unknown as { cookie: string }).cookie, range: 'bytes=2-5' },
    });
    expect(partial.statusCode).toBe(206);
    expect(partial.body).toBe('AABB');
    expect((await player.get(`/campaigns/${campaignId}/recordings/${recording.id}/audio`)).statusCode).toBe(403);
  });
});

describe('trace de session', () => {
  it('rassemble enregistrements et événements de toutes catégories', async () => {
    const trace = (await gm.get(`/campaigns/${campaignId}/sessions/1/trace`)).json();
    expect(trace.session.number).toBe(1);
    expect(trace.transcriptVisible).toBe(true);
    expect(trace.recordings).toHaveLength(1);
    expect(trace.events[0].type).toBe('session.started');
    expect(trace.events.some((e: EventDto) => e.payload.origin === 'recording')).toBe(true);
    const forPlayer = (await player.get(`/campaigns/${campaignId}/sessions/1/trace`)).json();
    expect(forPlayer.transcriptVisible).toBe(false);
    expect(forPlayer.events.some((e: EventDto) => e.visibility === 'gm_only')).toBe(false);
    expect((await gm.get(`/campaigns/${campaignId}/sessions/9/trace`)).statusCode).toBe(404);
  });

  it('la fin de session arrête l’enregistrement et analyse ce qui restait', async () => {
    analyzer.next = (c) => [proposal({ type: 'narrative.discovery', title: 'Une carte du volcan', fromSeq: c.segments[0]!.seq, toSeq: c.segments[0]!.seq })];
    await gm.post(`/campaigns/${campaignId}/recordings/${recording.id}/segments`, { deviceId: DEVICE, segments: segs(5, ['Vous trouvez une carte']) });
    await gm.post(`/campaigns/${campaignId}/sessions/end`, { summary: '' });
    await built.services.recording.drain();
    const [r] = (await gm.get(`/campaigns/${campaignId}/recordings?sessionNo=1`)).json().recordings;
    expect(r.status).toBe('ended');
    expect(r.analysis.pendingWords).toBe(0);
    expect((await gm.get(`/campaigns/${campaignId}/recordings/live`)).json().recording).toBeNull();
    const titles = (await gm.get(`/campaigns/${campaignId}/events?origin=recording`)).json().events.map((e: EventDto) => e.title);
    expect(titles).toContain('Une carte du volcan');
  });
});
