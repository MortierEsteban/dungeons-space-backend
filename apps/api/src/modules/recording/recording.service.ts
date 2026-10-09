import { createReadStream } from 'node:fs';
import { mkdir, appendFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  campaignSettingsSchema,
  NARRATIVE_TYPES,
  type appendSegmentsSchema,
  type CampaignSettings,
  type EntityRef,
  type RecordingDto,
  type SessionTraceDto,
  type startRecordingSchema,
  type TranscriptPageDto,
  type transcriptQuerySchema,
  type TranscriptSegmentDto,
} from '@ds/shared';
import { and, asc, desc, eq, gt, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { RecordingConfig } from '../../config';
import type { Db } from '../../infra/db/client';
import type { Realtime } from '../../infra/realtime';
import { badRequest, conflict, forbidden, notFound } from '../../kernel/errors';
import { isUuid, type Viewer } from '../campaigns/access';
import { campaigns, gameSessions } from '../campaigns/campaigns.tables';
import type { CharactersService } from '../characters/characters.service';
import type { AppendEvent, ChronicleService } from '../chronicle/chronicle.service';
import type { ConstellationService } from '../constellation/constellation.service';
import type { IdentityService } from '../identity/identity.service';
import type { AnalysisSegment, ProposedEvent, SessionAnalyzer } from './analyzer';
import { recordingAnalyses, sessionRecordings, transcriptSegments } from './recording.tables';

type RecordingRow = typeof sessionRecordings.$inferSelect;
type SegmentRow = typeof transcriptSegments.$inferSelect;
type CampaignRow = typeof campaigns.$inferSelect;

/** auto : au fil de l'eau, selon les seuils ; flush : tout ce qui reste (pause, arrêt) ; manual : demandé par le MJ. */
type AnalysisMode = 'auto' | 'flush' | 'manual';

/** Un appareil silencieux depuis ce délai peut être relayé par un autre. */
const STALE_DEVICE_MS = 90_000;
/** Les derniers envois d'un appareil restent acceptés peu après l'arrêt (fin de session côté serveur). */
const LATE_GRACE_MS = 5 * 60_000;
const RETRY_AFTER_FAILURE_MS = 2 * 60_000;
const MAX_FAILURES_PER_WINDOW = 3;
const MIN_CONFIDENCE = 0.2;
const NARRATIVE_TYPE_IDS = new Set(NARRATIVE_TYPES.map((t) => t.type));

export const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/u).length : 0);

export interface RecordingDeps {
  db: Db;
  realtime: Realtime;
  chronicle: ChronicleService;
  identity: IdentityService;
  characters: CharactersService;
  constellation: ConstellationService;
  config: RecordingConfig;
  /** null : pas d'analyse (aucune clé d'API) — la transcription est tout de même conservée. */
  analyzer: SessionAnalyzer | null;
  audioDir: string;
  onError?: (err: unknown, message: string) => void;
}

/**
 * Enregistrement permanent des sessions : la transcription arrive par lots depuis l'appareil qui capte
 * le son, et un modèle de langage la lit au fil de l'eau pour inscrire les événements dans la Chronique.
 * Chaque analyse est journalisée (fenêtre de segments → événements créés), rejouable sans doublon.
 */
export class RecordingService {
  private readonly analysisChains = new Map<string, Promise<number>>();
  private readonly audioChains = new Map<string, Promise<unknown>>();
  private readonly failures = new Map<string, { fromSeq: number; count: number; at: number }>();
  private readonly background = new Set<Promise<unknown>>();

  constructor(private readonly deps: RecordingDeps) {}

  private get db() {
    return this.deps.db;
  }

  // ───────────────────────────── Accès ─────────────────────────────

  private async campaign(campaignId: string): Promise<{ row: CampaignRow; settings: CampaignSettings }> {
    const row = await this.db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
    if (!row) throw notFound('Campagne introuvable.');
    return { row, settings: campaignSettingsSchema.parse(row.settings) };
  }

  private assertGm(viewer: Viewer, message = 'Seul le MJ gère l’enregistrement des sessions.') {
    if (viewer.role !== 'gm') throw forbidden(message);
  }

  private async getRecording(campaignId: string, recordingId: string): Promise<RecordingRow> {
    if (!isUuid(recordingId)) throw notFound('Enregistrement introuvable.');
    const row = await this.db.query.sessionRecordings.findFirst({ where: and(eq(sessionRecordings.id, recordingId), eq(sessionRecordings.campaignId, campaignId)) });
    if (!row) throw notFound('Enregistrement introuvable.');
    return row;
  }

  private async openSession(campaignId: string) {
    return this.db.query.gameSessions.findFirst({ where: and(eq(gameSessions.campaignId, campaignId), isNull(gameSessions.endedAt)) });
  }

  // ───────────────────────────── Projection ─────────────────────────────

  private async toDtos(rows: RecordingRow[], viewer: Viewer): Promise<RecordingDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const names = await this.deps.identity.namesOf(rows.map((r) => r.startedBy ?? ''));
    const analyses = await this.db
      .select({
        recordingId: recordingAnalyses.recordingId,
        status: recordingAnalyses.status,
        events: sql<number>`jsonb_array_length(${recordingAnalyses.eventIds})`,
        error: recordingAnalyses.error,
        finishedAt: recordingAnalyses.finishedAt,
      })
      .from(recordingAnalyses)
      .where(inArray(recordingAnalyses.recordingId, ids))
      .orderBy(asc(recordingAnalyses.createdAt));
    const pending = await this.db
      .select({ recordingId: transcriptSegments.recordingId, words: sql<number>`coalesce(sum(${transcriptSegments.words}), 0)::int` })
      .from(transcriptSegments)
      .innerJoin(sessionRecordings, eq(sessionRecordings.id, transcriptSegments.recordingId))
      .where(and(inArray(transcriptSegments.recordingId, ids), gt(transcriptSegments.seq, sessionRecordings.analyzedSeq)))
      .groupBy(transcriptSegments.recordingId);
    const clientSeqs =
      viewer.role === 'gm'
        ? await this.db
            .select({ recordingId: transcriptSegments.recordingId, max: sql<number>`max(${transcriptSegments.clientSeq})::int` })
            .from(transcriptSegments)
            .where(inArray(transcriptSegments.recordingId, ids))
            .groupBy(transcriptSegments.recordingId)
        : [];
    return rows.map((r) => {
      const mine = analyses.filter((a) => a.recordingId === r.id);
      const last = mine[mine.length - 1];
      const done = mine.filter((a) => a.status === 'done' && a.finishedAt);
      const max = clientSeqs.find((c) => c.recordingId === r.id)?.max;
      return {
        id: r.id,
        campaignId: r.campaignId,
        sessionNo: r.sessionNo,
        status: r.status,
        startedAt: r.startedAt.toISOString(),
        endedAt: r.endedAt?.toISOString() ?? null,
        startedBy: r.startedBy ? { id: r.startedBy, name: names.get(r.startedBy) ?? 'MJ' } : null,
        deviceId: viewer.role === 'gm' ? r.deviceId : null,
        lastSeenAt: r.lastSeenAt.toISOString(),
        segmentCount: r.segmentCount,
        wordCount: r.wordCount,
        nextClientSeq: max === undefined || max === null ? 0 : max + 1,
        analysis: {
          available: this.deps.analyzer !== null,
          running: this.analysisChains.has(r.id),
          analyzedSeq: r.analyzedSeq,
          pendingWords: pending.find((p) => p.recordingId === r.id)?.words ?? 0,
          eventsCreated: mine.reduce((n, a) => n + Number(a.events), 0),
          lastAnalyzedAt: done[done.length - 1]?.finishedAt?.toISOString() ?? null,
          lastError: last && last.status !== 'done' && last.status !== 'running' ? last.error : null,
        },
        audio: viewer.role === 'gm' && r.audioChunks > 0 ? { chunks: r.audioChunks, bytes: r.audioBytes } : null,
      };
    });
  }

  private async dto(row: RecordingRow, viewer: Viewer): Promise<RecordingDto> {
    const [dto] = await this.toDtos([row], viewer);
    return dto!;
  }

  // ───────────────────────────── Lecture ─────────────────────────────

  async list(campaignId: string, viewer: Viewer, sessionNo?: number): Promise<RecordingDto[]> {
    const rows = await this.db
      .select()
      .from(sessionRecordings)
      .where(and(eq(sessionRecordings.campaignId, campaignId), sessionNo === undefined ? undefined : eq(sessionRecordings.sessionNo, sessionNo)))
      .orderBy(desc(sessionRecordings.startedAt));
    return this.toDtos(rows, viewer);
  }

  /** Enregistrement en cours (ou en pause) de la session ouverte : toute la table sait qu'elle est enregistrée. */
  async live(campaignId: string, viewer: Viewer): Promise<RecordingDto | null> {
    const row = await this.db.query.sessionRecordings.findFirst({
      where: and(eq(sessionRecordings.campaignId, campaignId), ne(sessionRecordings.status, 'ended')),
      orderBy: desc(sessionRecordings.startedAt),
    });
    return row ? this.dto(row, viewer) : null;
  }

  async transcript(campaignId: string, viewer: Viewer, sessionNo: number, q: z.infer<typeof transcriptQuerySchema>): Promise<TranscriptPageDto> {
    const { settings } = await this.campaign(campaignId);
    if (viewer.role !== 'gm' && !settings.recording.playersSeeTranscript) throw forbidden('La transcription est réservée au MJ.');
    const offset = q.after ?? 0;
    // Ordre d'insertion : la transcription est append-only, le curseur reste stable pendant l'enregistrement.
    const rows = await this.db
      .select({ s: transcriptSegments, analyzedSeq: sessionRecordings.analyzedSeq })
      .from(transcriptSegments)
      .innerJoin(sessionRecordings, eq(sessionRecordings.id, transcriptSegments.recordingId))
      .where(and(eq(transcriptSegments.campaignId, campaignId), eq(transcriptSegments.sessionNo, sessionNo)))
      .orderBy(asc(transcriptSegments.createdAt), asc(transcriptSegments.recordingId), asc(transcriptSegments.seq))
      .offset(offset)
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    return {
      segments: page.map(({ s, analyzedSeq }) => segmentDto(s, analyzedSeq)),
      nextAfter: rows.length > q.limit ? offset + q.limit : null,
    };
  }

  async trace(campaignId: string, viewer: Viewer, sessionNo: number): Promise<SessionTraceDto> {
    const { settings } = await this.campaign(campaignId);
    const session = await this.db.query.gameSessions.findFirst({ where: and(eq(gameSessions.campaignId, campaignId), eq(gameSessions.number, sessionNo)) });
    if (!session && sessionNo !== 0) throw notFound('Session introuvable.');
    return {
      session: session
        ? { id: session.id, number: session.number, title: session.title, summary: session.summary, startedAt: session.startedAt.toISOString(), endedAt: session.endedAt?.toISOString() ?? null }
        : null,
      sessionNo,
      recordings: await this.list(campaignId, viewer, sessionNo),
      events: await this.deps.chronicle.sessionEvents(campaignId, viewer, sessionNo),
      transcriptVisible: viewer.role === 'gm' || settings.recording.playersSeeTranscript,
    };
  }

  // ───────────────────────────── Cycle de vie ─────────────────────────────

  async start(campaignId: string, viewer: Viewer, input: z.infer<typeof startRecordingSchema>): Promise<RecordingDto> {
    this.assertGm(viewer);
    const { settings } = await this.campaign(campaignId);
    if (!settings.recording.enabled) throw badRequest('L’enregistrement des sessions est désactivé dans les réglages de la campagne.');
    const session = await this.openSession(campaignId);
    if (!session) throw badRequest('Démarrez d’abord une session : l’enregistrement s’y rattache.');
    const current = await this.db.query.sessionRecordings.findFirst({
      where: and(eq(sessionRecordings.campaignId, campaignId), eq(sessionRecordings.sessionNo, session.number), ne(sessionRecordings.status, 'ended')),
      orderBy: desc(sessionRecordings.startedAt),
    });
    let row: RecordingRow;
    if (current) {
      const stale = Date.now() - current.lastSeenAt.getTime() > STALE_DEVICE_MS;
      const free = current.deviceId === input.deviceId || current.status === 'paused' || stale || input.takeover;
      if (!free) throw conflict('Un autre appareil enregistre déjà cette session. Reprenez la main pour enregistrer depuis celui-ci.');
      [row] = await this.db.update(sessionRecordings).set({ status: 'live', deviceId: input.deviceId, lastSeenAt: new Date() }).where(eq(sessionRecordings.id, current.id)).returning() as [RecordingRow];
    } else {
      [row] = (await this.db
        .insert(sessionRecordings)
        .values({ campaignId, sessionNo: session.number, deviceId: input.deviceId, startedBy: viewer.userId, status: 'live' })
        .returning()) as [RecordingRow];
    }
    this.deps.realtime.changed(campaignId, 'recording');
    return this.dto(row, viewer);
  }

  async pause(campaignId: string, viewer: Viewer, recordingId: string): Promise<RecordingDto> {
    return this.setStatus(campaignId, viewer, recordingId, 'paused');
  }

  async stop(campaignId: string, viewer: Viewer, recordingId: string): Promise<RecordingDto> {
    return this.setStatus(campaignId, viewer, recordingId, 'ended');
  }

  private async setStatus(campaignId: string, viewer: Viewer, recordingId: string, status: 'paused' | 'ended'): Promise<RecordingDto> {
    this.assertGm(viewer);
    const current = await this.getRecording(campaignId, recordingId);
    if (current.status === 'ended') return this.dto(current, viewer);
    const [row] = await this.db
      .update(sessionRecordings)
      .set({ status, ...(status === 'ended' ? { endedAt: new Date() } : {}) })
      .where(eq(sessionRecordings.id, recordingId))
      .returning();
    this.deps.realtime.changed(campaignId, 'recording');
    // Une pause ou un arrêt n'attend pas les seuils : ce qui a été dit est analysé tout de suite.
    this.schedule(recordingId, 'flush');
    return this.dto(row!, viewer);
  }

  /** La session se termine : ses enregistrements s'arrêtent et la fin de la transcription est analysée. */
  async sessionEnded(campaignId: string, sessionNo: number): Promise<void> {
    const rows = await this.db
      .update(sessionRecordings)
      .set({ status: 'ended', endedAt: new Date() })
      .where(and(eq(sessionRecordings.campaignId, campaignId), eq(sessionRecordings.sessionNo, sessionNo), ne(sessionRecordings.status, 'ended')))
      .returning({ id: sessionRecordings.id });
    if (rows.length === 0) return;
    this.deps.realtime.changed(campaignId, 'recording');
    for (const r of rows) this.schedule(r.id, 'flush');
  }

  // ───────────────────────────── Transcription ─────────────────────────────

  private assertDevice(row: RecordingRow, deviceId: string) {
    const late = row.status === 'ended' && row.endedAt && Date.now() - row.endedAt.getTime() > LATE_GRACE_MS;
    if (late) throw badRequest('Cet enregistrement est terminé.');
    if (row.deviceId !== deviceId) throw conflict('Un autre appareil a repris l’enregistrement.');
  }

  async appendSegments(campaignId: string, viewer: Viewer, recordingId: string, input: z.infer<typeof appendSegmentsSchema>): Promise<{ accepted: number; recording: RecordingDto }> {
    this.assertGm(viewer);
    const current = await this.getRecording(campaignId, recordingId);
    this.assertDevice(current, input.deviceId);
    const now = Date.now();
    const accepted = await this.db.transaction(async (tx) => {
      // Le verrou de ligne sur l'enregistrement sérialise les lots : séquence contiguë, pas de doublon.
      const [locked] = await tx.update(sessionRecordings).set({ lastSeenAt: new Date(now) }).where(eq(sessionRecordings.id, recordingId)).returning();
      const wanted = [...new Map(input.segments.map((s) => [s.clientSeq, s])).values()];
      const known = await tx
        .select({ clientSeq: transcriptSegments.clientSeq })
        .from(transcriptSegments)
        .where(and(eq(transcriptSegments.recordingId, recordingId), inArray(transcriptSegments.clientSeq, wanted.map((s) => s.clientSeq))));
      const seen = new Set(known.map((k) => k.clientSeq));
      const fresh = wanted.filter((s) => !seen.has(s.clientSeq)).sort((a, b) => a.clientSeq - b.clientSeq);
      if (fresh.length === 0) return 0;
      const words = fresh.reduce((n, s) => n + countWords(s.text), 0);
      await tx
        .update(sessionRecordings)
        .set({ segmentCount: sql`${sessionRecordings.segmentCount} + ${fresh.length}`, wordCount: sql`${sessionRecordings.wordCount} + ${words}` })
        .where(eq(sessionRecordings.id, recordingId));
      const startedAt = locked!.startedAt.getTime();
      await tx.insert(transcriptSegments).values(
        fresh.map((s, k) => {
          const spokenAt = Math.max(startedAt, now - s.ageMs);
          return {
            recordingId,
            campaignId,
            sessionNo: locked!.sessionNo,
            seq: locked!.segmentCount + k + 1,
            clientSeq: s.clientSeq,
            speaker: s.speaker,
            text: s.text,
            words: countWords(s.text),
            offsetMs: spokenAt - startedAt,
            durationMs: s.durationMs,
            spokenAt: new Date(spokenAt),
          };
        }),
      );
      return fresh.length;
    });
    if (accepted > 0) this.schedule(recordingId, 'auto');
    return { accepted, recording: await this.dto(await this.getRecording(campaignId, recordingId), viewer) };
  }

  // ───────────────────────────── Archive audio ─────────────────────────────

  private audioPath(recordingId: string) {
    return path.join(this.deps.audioDir, `${recordingId}.audio`);
  }

  /** Ajoute un morceau à l'archive audio, dans l'ordre (un renvoi du même morceau est ignoré). */
  async appendAudio(campaignId: string, viewer: Viewer, recordingId: string, input: { index: number; deviceId: string; mime: string; data: Buffer }): Promise<{ chunks: number }> {
    this.assertGm(viewer);
    const { settings } = await this.campaign(campaignId);
    if (!settings.recording.keepAudio) throw badRequest('La conservation de l’audio est désactivée dans les réglages de la campagne.');
    const previous = this.audioChains.get(recordingId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const row = await this.getRecording(campaignId, recordingId);
      this.assertDevice(row, input.deviceId);
      if (input.index < row.audioChunks) return { chunks: row.audioChunks };
      if (input.index > row.audioChunks) throw conflict(`Morceau ${row.audioChunks} attendu.`);
      await mkdir(this.deps.audioDir, { recursive: true });
      await appendFile(this.audioPath(recordingId), input.data);
      const [updated] = await this.db
        .update(sessionRecordings)
        .set({ audioChunks: row.audioChunks + 1, audioBytes: row.audioBytes + input.data.length, audioMime: row.audioMime ?? input.mime })
        .where(eq(sessionRecordings.id, recordingId))
        .returning();
      return { chunks: updated!.audioChunks };
    });
    this.audioChains.set(recordingId, next);
    try {
      return await next;
    } finally {
      if (this.audioChains.get(recordingId) === next) this.audioChains.delete(recordingId);
    }
  }

  /** Archive audio (MJ seulement), avec prise en charge des plages pour pouvoir se déplacer dans la lecture. */
  async audio(campaignId: string, viewer: Viewer, recordingId: string, range: string | undefined) {
    this.assertGm(viewer, 'L’archive audio est réservée au MJ.');
    const row = await this.getRecording(campaignId, recordingId);
    if (row.audioChunks === 0) throw notFound('Aucun audio conservé pour cet enregistrement.');
    const file = this.audioPath(recordingId);
    const size = (await stat(file).catch(() => null))?.size;
    if (!size) throw notFound('Archive audio introuvable.');
    const mime = row.audioMime ?? 'audio/webm';
    const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
      if (start >= size || start > end) return { status: 416 as const, mime, size, headers: { 'content-range': `bytes */${size}` } };
      return { status: 206 as const, mime, size: end - start + 1, stream: createReadStream(file, { start, end }), headers: { 'content-range': `bytes ${start}-${end}/${size}` } };
    }
    return { status: 200 as const, mime, size, stream: createReadStream(file), headers: {} };
  }

  // ───────────────────────────── Analyse ─────────────────────────────

  /** Analyse tout de suite ce qui attend (bouton du MJ) ; renvoie le nombre d'événements créés. */
  async analyzeNow(campaignId: string, viewer: Viewer, recordingId: string): Promise<{ created: number; recording: RecordingDto }> {
    this.assertGm(viewer);
    if (!this.deps.analyzer) throw badRequest('Aucun analyseur n’est configuré sur le serveur (clé ANTHROPIC_API_KEY absente).');
    await this.getRecording(campaignId, recordingId);
    const created = await this.analyze(recordingId, 'manual');
    return { created, recording: await this.dto(await this.getRecording(campaignId, recordingId), viewer) };
  }

  /** Lance une analyse en arrière-plan (les erreurs sont journalisées, jamais propagées à l'appelant). */
  schedule(recordingId: string, mode: AnalysisMode): void {
    if (!this.deps.analyzer) return;
    const task = this.analyze(recordingId, mode).catch((err) => this.deps.onError?.(err, 'Analyse de l’enregistrement en échec'));
    this.background.add(task);
    void task.finally(() => this.background.delete(task));
  }

  /** Attend la fin des analyses en cours (arrêt du serveur, tests). */
  async drain(): Promise<void> {
    while (this.background.size || this.analysisChains.size) {
      await Promise.allSettled([...this.background, ...this.analysisChains.values()]);
    }
  }

  /** Une seule analyse à la fois par enregistrement : les demandes s'enchaînent. */
  private analyze(recordingId: string, mode: AnalysisMode): Promise<number> {
    const previous = this.analysisChains.get(recordingId) ?? Promise.resolve(0);
    const next = previous.catch(() => 0).then(() => this.runPending(recordingId, mode));
    this.analysisChains.set(recordingId, next);
    void next
      .catch(() => undefined)
      .finally(() => {
        if (this.analysisChains.get(recordingId) === next) this.analysisChains.delete(recordingId);
      });
    return next;
  }

  private async runPending(recordingId: string, mode: AnalysisMode): Promise<number> {
    const { minWords, maxDelayMs, maxWindowWords } = this.deps.config;
    let created = 0;
    for (let guard = 0; guard < 100; guard++) {
      const rec = await this.db.query.sessionRecordings.findFirst({ where: eq(sessionRecordings.id, recordingId) });
      if (!rec) return created;
      const { row: campaign, settings } = await this.campaign(rec.campaignId);
      if (mode !== 'manual' && !settings.recording.autoAnalyze) return created;
      const pending = await this.db
        .select()
        .from(transcriptSegments)
        .where(and(eq(transcriptSegments.recordingId, recordingId), gt(transcriptSegments.seq, rec.analyzedSeq)))
        .orderBy(asc(transcriptSegments.seq))
        .limit(2000);
      if (pending.length === 0) return created;
      const words = pending.reduce((n, s) => n + s.words, 0);
      if (mode === 'auto') {
        const waited = Date.now() - pending[0]!.spokenAt.getTime();
        if (words < minWords && waited < maxDelayMs) return created;
        const failure = this.failures.get(recordingId);
        if (failure && Date.now() - failure.at < RETRY_AFTER_FAILURE_MS) return created;
      }
      const window: SegmentRow[] = [];
      let budget = 0;
      for (const s of pending) {
        if (window.length && budget + s.words > maxWindowWords) break;
        window.push(s);
        budget += s.words;
      }
      const outcome = await this.analyzeWindow(rec, campaign, settings, window);
      if (outcome === null) return created;
      created += outcome;
      // En mode automatique, un reliquat sous le seuil attend la suite de la conversation.
      if (mode === 'auto' && words - budget < minWords) return created;
    }
    return created;
  }

  /** Analyse une fenêtre ; null si elle a échoué (elle sera retentée plus tard). */
  private async analyzeWindow(rec: RecordingRow, campaign: CampaignRow, settings: CampaignSettings, window: SegmentRow[]): Promise<number | null> {
    const analyzer = this.deps.analyzer!;
    const fromSeq = window[0]!.seq;
    const toSeq = window[window.length - 1]!.seq;
    const gm: Viewer = { userId: rec.startedBy ?? campaign.createdBy, role: 'gm' };
    const [analysis] = await this.db
      .insert(recordingAnalyses)
      .values({ recordingId: rec.id, campaignId: rec.campaignId, fromSeq, toSeq, status: 'running', model: analyzer.model })
      .returning();

    try {
      const [characters, constellation, recent, previous] = await Promise.all([
        this.deps.characters.list(rec.campaignId, gm),
        this.deps.constellation.get(rec.campaignId, gm, true),
        this.deps.chronicle.query(rec.campaignId, gm, { sessionNo: rec.sessionNo, categories: 'narrative,social', limit: 40 }),
        this.db
          .select()
          .from(transcriptSegments)
          .where(and(eq(transcriptSegments.recordingId, rec.id), lte(transcriptSegments.seq, rec.analyzedSeq)))
          .orderBy(desc(transcriptSegments.seq))
          .limit(12),
      ]);
      const toSegment = (s: SegmentRow): AnalysisSegment => ({ seq: s.seq, speaker: s.speaker, text: s.text, minute: Math.round(s.offsetMs / 60_000) });
      const nodes = constellation.nodes.filter((n) => n.kind !== 'event' && n.refType !== 'character');
      const recentEvents = recent.events.filter((e) => !e.retracted).reverse();
      const result = await analyzer.analyze({
        campaign: { name: campaign.name, synopsis: campaign.synopsis, tone: campaign.tone },
        sessionNo: rec.sessionNo,
        characters: characters.slice(0, 150).map((c) => ({ id: c.id, name: c.name, kind: c.kind, player: c.kind === 'pc' ? c.ownerName : null })),
        nodes: nodes.slice(0, 200).map((n) => ({ id: n.id, name: n.label, kind: n.kind })),
        recentEvents: recentEvents.map((e) => ({ id: e.id, type: e.type, title: e.title, text: e.text })),
        previous: previous.reverse().map(toSegment),
        segments: window.map(toSegment),
      });

      const known = {
        character: new Set(characters.map((c) => c.id)),
        node: new Set(nodes.map((n) => n.id)),
        event: new Set(recentEvents.map((e) => e.id)),
      };
      const proposals = result.events.filter((e) => e.title.trim() && e.confidence >= MIN_CONFIDENCE);
      const inputs: AppendEvent[] = proposals.map((e, k) => this.toAppendEvent(rec, settings, analysis!.id, e, k, { fromSeq, toSeq }, known));
      const rows = await this.deps.chronicle.appendMany(rec.campaignId, inputs);
      for (const [k, e] of proposals.entries()) {
        const row = rows.find((r) => r.idempotencyKey === inputs[k]!.idempotencyKey);
        if (!row || !rec.startedBy) continue;
        for (const related of e.relatedEventIds.filter((id) => known.event.has(id))) {
          await this.deps.chronicle.createLink(rec.campaignId, { userId: rec.startedBy, role: 'gm' }, related, row.id).catch(() => undefined);
        }
      }
      await this.db
        .update(recordingAnalyses)
        .set({ status: 'done', model: result.model, eventIds: rows.map((r) => r.id), inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, finishedAt: new Date() })
        .where(eq(recordingAnalyses.id, analysis!.id));
      await this.db
        .update(sessionRecordings)
        .set({ analyzedSeq: sql`greatest(${sessionRecordings.analyzedSeq}, ${toSeq})` })
        .where(eq(sessionRecordings.id, rec.id));
      this.failures.delete(rec.id);
      await this.deps.chronicle.publish(rows);
      this.deps.realtime.changed(rec.campaignId, 'recording');
      return rows.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const previous = this.failures.get(rec.id);
      const count = previous && previous.fromSeq === fromSeq ? previous.count + 1 : 1;
      this.failures.set(rec.id, { fromSeq, count, at: Date.now() });
      // Une fenêtre qui échoue sans cesse ne bloque pas la suite : elle est abandonnée (et tracée comme telle).
      const skip = count >= MAX_FAILURES_PER_WINDOW;
      await this.db
        .update(recordingAnalyses)
        .set({ status: skip ? 'skipped' : 'failed', error: message.slice(0, 500), finishedAt: new Date() })
        .where(eq(recordingAnalyses.id, analysis!.id));
      if (skip) {
        await this.db.update(sessionRecordings).set({ analyzedSeq: sql`greatest(${sessionRecordings.analyzedSeq}, ${toSeq})` }).where(eq(sessionRecordings.id, rec.id));
        this.failures.delete(rec.id);
      }
      this.deps.realtime.changed(rec.campaignId, 'recording');
      this.deps.onError?.(err, 'Analyse d’une fenêtre de transcription en échec');
      return skip ? 0 : null;
    }
  }

  private toAppendEvent(
    rec: RecordingRow,
    settings: CampaignSettings,
    analysisId: string,
    e: ProposedEvent,
    k: number,
    window: { fromSeq: number; toSeq: number },
    known: { character: Set<string>; node: Set<string> },
  ): AppendEvent {
    const ref = (r: ProposedEvent['actors'][number]): EntityRef => {
      const name = r.name.trim().slice(0, 120) || 'Inconnu';
      if ((r.kind === 'character' || r.kind === 'node') && r.id && known[r.kind].has(r.id)) return { kind: r.kind, id: r.id, name };
      return { kind: 'free', id: null, name };
    };
    const refs = (list: ProposedEvent['actors']) => list.slice(0, 20).map(ref);
    const clampSeq = (n: number) => Math.min(window.toSeq, Math.max(window.fromSeq, Math.round(n)));
    const from = clampSeq(e.fromSeq);
    return {
      campaignId: rec.campaignId,
      type: NARRATIVE_TYPE_IDS.has(e.type) ? e.type : 'narrative.note',
      title: e.title.trim().slice(0, 160),
      text: e.text.trim().slice(0, 10000),
      importance: Math.min(5, Math.max(1, Math.round(e.importance))),
      visibility: e.gmOnly ? 'gm_only' : settings.recording.autoVisibility,
      actors: refs(e.actors),
      targets: refs(e.targets),
      places: e.places.map((p) => p.trim().slice(0, 120)).filter(Boolean).slice(0, 10),
      inGameDate: e.inGameDate?.trim().slice(0, 60) || null,
      payload: {
        origin: 'recording',
        recordingId: rec.id,
        analysisId,
        segments: [from, Math.max(from, clampSeq(e.toSeq))],
        confidence: Math.round(Math.min(1, Math.max(0, e.confidence)) * 100) / 100,
      },
      source: 'system',
      sessionNo: rec.sessionNo,
      // Rejouer la même fenêtre (reprise après incident) ne crée pas de doublon.
      idempotencyKey: `rec:${rec.id}:${window.fromSeq}-${window.toSeq}:${k}`,
    };
  }
}

function segmentDto(s: SegmentRow, analyzedSeq: number): TranscriptSegmentDto {
  return {
    id: s.id,
    recordingId: s.recordingId,
    seq: s.seq,
    speaker: s.speaker,
    text: s.text,
    offsetMs: s.offsetMs,
    durationMs: s.durationMs,
    spokenAt: s.spokenAt.toISOString(),
    analyzed: s.seq <= analyzedSeq,
  };
}
