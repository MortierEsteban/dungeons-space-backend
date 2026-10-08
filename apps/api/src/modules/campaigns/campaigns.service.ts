import { randomInt } from 'node:crypto';
import {
  campaignSettingsSchema,
  type CampaignDto,
  type CampaignSummaryDto,
  type createCampaignSchema,
  type DiscoverCampaignDto,
  type InvitationDto,
  type Role,
  type SessionDto,
  type updateCampaignSchema,
  type UserDto,
} from '@ds/shared';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../../infra/db/client';
import type { Realtime } from '../../infra/realtime';
import { badRequest, conflict, forbidden, notFound } from '../../kernel/errors';
import { characters } from '../characters/characters.tables';
import type { ChronicleService } from '../chronicle/chronicle.service';
import { users } from '../identity/identity.tables';
import { isUuid, type CampaignAccess, type Viewer } from './access';
import { campaigns, gameSessions, invitations, memberships } from './campaigns.tables';

type CampaignRow = typeof campaigns.$inferSelect;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateJoinCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

function sessionDto(s: typeof gameSessions.$inferSelect): SessionDto {
  return { id: s.id, number: s.number, title: s.title, startedAt: s.startedAt.toISOString(), endedAt: s.endedAt?.toISOString() ?? null, summary: s.summary };
}

export class CampaignsService {
  constructor(
    private readonly db: Db,
    private readonly access: CampaignAccess,
    private readonly chronicle: ChronicleService,
    private readonly realtime: Realtime,
  ) {}

  // ───────────────────────────── Lecture ─────────────────────────────

  private async summaries(rows: CampaignRow[], roles: Map<string, Role>): Promise<CampaignSummaryDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const members = await this.db
      .select({ campaignId: memberships.campaignId, role: memberships.role, name: users.displayName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(inArray(memberships.campaignId, ids));
    const sessions = await this.db
      .select({ campaignId: gameSessions.campaignId, n: sql<number>`max(${gameSessions.number})::int` })
      .from(gameSessions)
      .where(inArray(gameSessions.campaignId, ids))
      .groupBy(gameSessions.campaignId);
    const levels = await this.db
      .select({ campaignId: characters.campaignId, lvl: sql<number>`max((${characters.sheet}->>'level')::int)` })
      .from(characters)
      .where(and(inArray(characters.campaignId, ids), eq(characters.kind, 'pc')))
      .groupBy(characters.campaignId);
    return rows.map((r) => {
      const m = members.filter((x) => x.campaignId === r.id);
      return {
        id: r.id,
        name: r.name,
        synopsis: r.synopsis,
        tone: r.tone,
        coverUrl: r.coverUrl,
        role: roles.get(r.id) ?? 'player',
        status: r.status,
        gmName: m.find((x) => x.role === 'gm')?.name ?? '—',
        playerCount: m.filter((x) => x.role === 'player').length,
        sessionCount: sessions.find((s) => s.campaignId === r.id)?.n ?? 0,
        level: levels.find((l) => l.campaignId === r.id)?.lvl ?? r.settings.startLevel,
        nextSessionAt: r.nextSessionAt?.toISOString() ?? null,
      };
    });
  }

  async listMine(userId: string): Promise<CampaignSummaryDto[]> {
    const mine = await this.db.select().from(memberships).where(eq(memberships.userId, userId));
    if (mine.length === 0) return [];
    const rows = await this.db
      .select()
      .from(campaigns)
      .where(inArray(campaigns.id, mine.map((m) => m.campaignId)))
      .orderBy(desc(campaigns.createdAt));
    return this.summaries(rows, new Map(mine.map((m) => [m.campaignId, m.role])));
  }

  /** Campagnes publiques (Explorer) : en cours, qui recrutent ou terminées. */
  async discover(userId: string): Promise<DiscoverCampaignDto[]> {
    const rows = await this.db.select().from(campaigns).where(eq(campaigns.visibility, 'public')).orderBy(desc(campaigns.createdAt)).limit(60);
    const mine = await this.db.select().from(memberships).where(eq(memberships.userId, userId));
    const roles = new Map(mine.map((m) => [m.campaignId, m.role]));
    const sums = await this.summaries(rows, roles);
    return sums.map((s) => {
      const row = rows.find((r) => r.id === s.id)!;
      return {
        id: s.id, name: s.name, synopsis: s.synopsis, tone: s.tone, coverUrl: s.coverUrl, gmName: s.gmName,
        playerCount: s.playerCount, level: s.level, status: s.status, recruiting: row.recruiting, myRole: roles.get(s.id) ?? null,
      };
    });
  }

  async get(campaignId: string, viewer: Viewer): Promise<CampaignDto> {
    const row = await this.db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
    if (!row) throw notFound('Campagne introuvable.');
    const [summary] = await this.summaries([row], new Map([[row.id, viewer.role]]));
    const members = await this.db
      .select({ userId: memberships.userId, role: memberships.role, joinedAt: memberships.joinedAt, name: users.displayName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.campaignId, campaignId))
      .orderBy(memberships.joinedAt);
    const invites = viewer.role === 'gm' ? await this.db.select().from(invitations).where(eq(invitations.campaignId, campaignId)) : [];
    const current = await this.db.query.gameSessions.findFirst({
      where: and(eq(gameSessions.campaignId, campaignId), isNull(gameSessions.endedAt)),
      orderBy: desc(gameSessions.number),
    });
    const stats = await this.chronicle.stats(campaignId);
    const [chars] = await this.db.select({ n: sql<number>`count(*)::int` }).from(characters).where(eq(characters.campaignId, campaignId));
    return {
      ...summary!,
      rulesetId: row.rulesetId,
      visibility: row.visibility,
      recruiting: row.recruiting,
      settings: campaignSettingsSchema.parse(row.settings),
      joinCode: viewer.role === 'gm' ? row.joinCode : null,
      members: members.map((m) => ({ userId: m.userId, displayName: m.name, role: m.role, joinedAt: m.joinedAt.toISOString() })),
      invitations: invites.map((i) => ({ id: i.id, email: i.email, createdAt: i.createdAt.toISOString() })),
      currentSession: current ? sessionDto(current) : null,
      stats: { events: stats.events, links: stats.links, sessions: summary!.sessionCount, characters: chars?.n ?? 0 },
    };
  }

  // ───────────────────────────── Écriture ─────────────────────────────

  async create(userId: string, input: z.infer<typeof createCampaignSchema>): Promise<CampaignDto> {
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(campaigns)
        .values({
          name: input.name,
          synopsis: input.synopsis,
          tone: input.tone,
          rulesetId: input.rulesetId,
          coverUrl: input.coverUrl,
          visibility: input.visibility,
          recruiting: input.recruiting,
          settings: input.settings,
          joinCode: generateJoinCode(),
          createdBy: userId,
        })
        .returning();
      await tx.insert(memberships).values({ campaignId: row!.id, userId, role: 'gm' });
      const emails = [...new Set(input.invites)];
      if (emails.length) await tx.insert(invitations).values(emails.map((email) => ({ campaignId: row!.id, email, invitedBy: userId })));
      return row!.id;
    });
    await this.chronicle.appendAndPublish({
      campaignId: id,
      type: 'narrative.note',
      title: `Fondation de la campagne « ${input.name} »`,
      text: input.synopsis,
      importance: 3,
      source: 'gm',
      authorId: userId,
      sessionNo: 0,
    });
    return this.get(id, { userId, role: 'gm' });
  }

  async update(campaignId: string, viewer: Viewer, patch: z.infer<typeof updateCampaignSchema>): Promise<CampaignDto> {
    if (viewer.role !== 'gm') throw forbidden('Réservé au Maître du Jeu.');
    const { nextSessionAt, settings, ...rest } = patch;
    const current = await this.db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
    if (!current) throw notFound();
    await this.db
      .update(campaigns)
      .set({
        ...rest,
        ...(settings ? { settings: { ...current.settings, ...settings } } : {}),
        ...(nextSessionAt !== undefined ? { nextSessionAt: nextSessionAt ? new Date(nextSessionAt) : null } : {}),
      })
      .where(eq(campaigns.id, campaignId));
    this.realtime.changed(campaignId, 'settings');
    return this.get(campaignId, viewer);
  }

  async remove(campaignId: string, viewer: Viewer): Promise<void> {
    if (viewer.role !== 'gm') throw forbidden('Réservé au Maître du Jeu.');
    await this.db.delete(campaigns).where(eq(campaigns.id, campaignId));
  }

  private async addMember(campaignId: string, user: Pick<UserDto, 'id' | 'displayName'>, role: Role): Promise<void> {
    const already = await this.access.roleOf(campaignId, user.id);
    if (already) return;
    await this.db.insert(memberships).values({ campaignId, userId: user.id, role });
    await this.chronicle.appendAndPublish({
      campaignId,
      type: 'campaign.member_joined',
      title: `${user.displayName} rejoint l’aventure`,
      source: 'system',
      authorId: user.id,
    });
    this.realtime.changed(campaignId, 'members');
  }

  async joinByCode(code: string, user: UserDto): Promise<CampaignSummaryDto> {
    const row = await this.db.query.campaigns.findFirst({ where: eq(campaigns.joinCode, code) });
    if (!row) throw notFound('Aucune campagne ne répond à ce code.');
    await this.addMember(row.id, user, 'player');
    await this.db.delete(invitations).where(and(eq(invitations.campaignId, row.id), eq(invitations.email, user.email)));
    return (await this.listMine(user.id)).find((c) => c.id === row.id)!;
  }

  /** Rejoindre une campagne publique qui recrute (bouton « Postuler » de l'Explorer). */
  async joinPublic(campaignId: string, user: UserDto): Promise<CampaignSummaryDto> {
    if (!isUuid(campaignId)) throw notFound();
    const row = await this.db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
    if (!row || row.visibility !== 'public') throw notFound('Campagne introuvable.');
    if (!row.recruiting) throw forbidden('Cette campagne ne recrute pas.');
    await this.addMember(row.id, user, 'player');
    return (await this.listMine(user.id)).find((c) => c.id === row.id)!;
  }

  async regenerateCode(campaignId: string, viewer: Viewer): Promise<string> {
    if (viewer.role !== 'gm') throw forbidden();
    const code = generateJoinCode();
    await this.db.update(campaigns).set({ joinCode: code }).where(eq(campaigns.id, campaignId));
    return code;
  }

  async invite(campaignId: string, viewer: Viewer, email: string): Promise<void> {
    if (viewer.role !== 'gm') throw forbidden();
    const existing = await this.db.query.invitations.findFirst({ where: and(eq(invitations.campaignId, campaignId), eq(invitations.email, email)) });
    if (existing) throw conflict('Cette personne est déjà invitée.');
    await this.db.insert(invitations).values({ campaignId, email, invitedBy: viewer.userId });
  }

  async revokeInvite(campaignId: string, viewer: Viewer, invitationId: string): Promise<void> {
    if (viewer.role !== 'gm') throw forbidden();
    if (!isUuid(invitationId)) throw notFound();
    await this.db.delete(invitations).where(and(eq(invitations.id, invitationId), eq(invitations.campaignId, campaignId)));
  }

  async invitationsFor(email: string): Promise<InvitationDto[]> {
    const rows = await this.db
      .select({ id: invitations.id, campaignId: invitations.campaignId, createdAt: invitations.createdAt, campaignName: campaigns.name, invitedBy: users.displayName })
      .from(invitations)
      .innerJoin(campaigns, eq(campaigns.id, invitations.campaignId))
      .innerJoin(users, eq(users.id, invitations.invitedBy))
      .where(eq(invitations.email, email));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  async acceptInvitation(invitationId: string, user: UserDto): Promise<CampaignSummaryDto> {
    if (!isUuid(invitationId)) throw notFound();
    const inv = await this.db.query.invitations.findFirst({ where: and(eq(invitations.id, invitationId), eq(invitations.email, user.email)) });
    if (!inv) throw notFound('Invitation introuvable.');
    await this.addMember(inv.campaignId, user, 'player');
    await this.db.delete(invitations).where(eq(invitations.id, inv.id));
    return (await this.listMine(user.id)).find((c) => c.id === inv.campaignId)!;
  }

  async removeMember(campaignId: string, viewer: Viewer, memberId: string): Promise<void> {
    const leaving = memberId === viewer.userId;
    if (!leaving && viewer.role !== 'gm') throw forbidden();
    if (leaving && viewer.role === 'gm') throw badRequest('Le MJ ne peut pas quitter sa propre campagne.');
    if (!isUuid(memberId)) throw notFound();
    await this.db.delete(memberships).where(and(eq(memberships.campaignId, campaignId), eq(memberships.userId, memberId)));
    this.realtime.changed(campaignId, 'members');
  }

  // ───────────────────────────── Sessions (CHR-08) ─────────────────────────────

  async listSessions(campaignId: string): Promise<SessionDto[]> {
    const rows = await this.db.select().from(gameSessions).where(eq(gameSessions.campaignId, campaignId)).orderBy(desc(gameSessions.number));
    return rows.map(sessionDto);
  }

  async startSession(campaignId: string, viewer: Viewer, title: string): Promise<SessionDto> {
    if (viewer.role !== 'gm') throw forbidden('Seul le MJ démarre une session.');
    const open = await this.db.query.gameSessions.findFirst({ where: and(eq(gameSessions.campaignId, campaignId), isNull(gameSessions.endedAt)) });
    if (open) throw conflict(`La session ${open.number} est déjà en cours.`);
    const last = await this.db.query.gameSessions.findFirst({ where: eq(gameSessions.campaignId, campaignId), orderBy: desc(gameSessions.number) });
    const number = (last?.number ?? 0) + 1;
    const [row] = await this.db.insert(gameSessions).values({ campaignId, number, title: title || `Session ${number}` }).returning();
    await this.chronicle.appendAndPublish({
      campaignId,
      type: 'session.started',
      title: `Session ${number}${title ? ` — ${title}` : ''}`,
      source: 'gm',
      authorId: viewer.userId,
      sessionNo: number,
    });
    this.realtime.changed(campaignId, 'session');
    return sessionDto(row!);
  }

  async endSession(campaignId: string, viewer: Viewer, summary: string): Promise<SessionDto> {
    if (viewer.role !== 'gm') throw forbidden('Seul le MJ clôt une session.');
    const open = await this.db.query.gameSessions.findFirst({ where: and(eq(gameSessions.campaignId, campaignId), isNull(gameSessions.endedAt)) });
    if (!open) throw badRequest('Aucune session en cours.');
    const [row] = await this.db.update(gameSessions).set({ endedAt: new Date(), summary }).where(eq(gameSessions.id, open.id)).returning();
    await this.chronicle.appendAndPublish({
      campaignId,
      type: 'session.ended',
      title: `Fin de la session ${open.number}`,
      text: summary,
      source: 'gm',
      authorId: viewer.userId,
      sessionNo: open.number,
    });
    this.realtime.changed(campaignId, 'session');
    return sessionDto(row!);
  }
}
