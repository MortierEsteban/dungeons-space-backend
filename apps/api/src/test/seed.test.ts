import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BuiltApp } from '../app';
import { DEMO_ACCOUNTS, seedDemo } from '../seed';
import { createTestApp, TestClient } from './helpers';

let built: BuiltApp;

beforeAll(async () => {
  built = await createTestApp();
});

afterAll(async () => {
  await built.close();
});

describe('données de démonstration', () => {
  it('peuple une campagne complète, une seule fois', async () => {
    expect(await seedDemo(built.services, built.database.db)).toBe(true);
    expect(await seedDemo(built.services, built.database.db)).toBe(false);

    const lyra = new TestClient(built);
    await lyra.post('/auth/login', { email: DEMO_ACCOUNTS.lyra.email, password: DEMO_ACCOUNTS.lyra.password });
    const campaigns = (await lyra.get('/campaigns')).json().campaigns;
    const valombre = campaigns.find((c: { name: string }) => c.name === 'Les Cendres de Valombre');
    expect(valombre.role).toBe('player');
    const detail = (await lyra.get(`/campaigns/${valombre.id}`)).json().campaign;
    expect(detail.stats.events).toBeGreaterThanOrEqual(15);
    expect(detail.stats.sessions).toBe(6);
    // Session 5 enregistrée : sa trace mêle événements notés et déduits ; la transcription reste au MJ.
    const trace = (await lyra.get(`/campaigns/${valombre.id}/sessions/5/trace`)).json();
    expect(trace.recordings).toHaveLength(1);
    expect(trace.events.filter((e: { payload: { origin?: string } }) => e.payload.origin === 'recording').length).toBeGreaterThanOrEqual(10);
    expect(trace.transcriptVisible).toBe(false);
    const encounters = (await lyra.get(`/campaigns/${valombre.id}/encounters`)).json().encounters;
    expect(encounters[0].status).toBe('active');
    const mine = (await lyra.get('/characters/mine')).json().characters;
    expect(mine[0].name).toBe('Elowen Sylvecœur');
    expect(mine[0].hp).toEqual({ current: 38, max: 44 });
  });
});
