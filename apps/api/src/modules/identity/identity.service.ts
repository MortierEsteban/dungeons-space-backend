import type { RegisterInput, UpdateProfileInput, UserDto } from '@ds/shared';
import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../../infra/db/client';
import { conflict, notFound, unauthorized } from '../../kernel/errors';
import { users } from './identity.tables';
import { hashPassword, verifyPassword } from './password';

type UserRow = typeof users.$inferSelect;

export function toUserDto(u: UserRow): UserDto {
  return { id: u.id, email: u.email, displayName: u.displayName, preference: u.preference, locale: u.locale, homeStyle: u.homeStyle };
}

export class IdentityService {
  constructor(private readonly db: Db) {}

  async register(input: Required<Pick<RegisterInput, 'displayName' | 'email' | 'password'>> & { preference: 'play' | 'lead' }): Promise<UserDto> {
    const existing = await this.db.query.users.findFirst({ where: eq(users.email, input.email) });
    if (existing) throw conflict('Un compte existe déjà avec ce courriel.');
    const [row] = await this.db
      .insert(users)
      .values({ email: input.email, displayName: input.displayName, passwordHash: await hashPassword(input.password), preference: input.preference })
      .returning();
    return toUserDto(row!);
  }

  async login(email: string, password: string): Promise<UserDto> {
    const row = await this.db.query.users.findFirst({ where: eq(users.email, email) });
    // Même message et même coût que l'utilisateur existe ou non (pas d'énumération de comptes).
    const ok = row ? await verifyPassword(password, row.passwordHash) : await verifyPassword(password, DUMMY_HASH);
    if (!row || !ok) throw unauthorized('Courriel ou mot de passe incorrect.');
    return toUserDto(row);
  }

  async get(id: string): Promise<UserDto | null> {
    const row = await this.db.query.users.findFirst({ where: eq(users.id, id) });
    return row ? toUserDto(row) : null;
  }

  async update(id: string, patch: UpdateProfileInput): Promise<UserDto> {
    const [row] = await this.db.update(users).set(patch).where(eq(users.id, id)).returning();
    if (!row) throw notFound();
    return toUserDto(row);
  }

  async namesOf(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const rows = await this.db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, unique));
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}

const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
