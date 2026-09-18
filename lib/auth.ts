import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, householdMembers, households, profiles } from "@/lib/db/schema";

const SESSION_COOKIE = "kk_session";
const ACTIVE_HOUSEHOLD_COOKIE = "kk_household";
const SESSION_DAYS = 90;

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(ACTIVE_HOUSEHOLD_COOKIE);
}

export async function getUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  emoji: string;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const userId = await getUserId();
  if (!userId) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, emoji: users.emoji })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

export async function setActiveHousehold(householdId: string) {
  const jar = await cookies();
  jar.set(ACTIVE_HOUSEHOLD_COOKIE, householdId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export type ActiveHousehold = {
  id: string;
  name: string;
  code: string;
  timezone: string;
  cookName: string | null;
  role: string;
  breakfastLockAt: string;
  lunchLockAt: string;
  dinnerLockAt: string;
  cookOffDays: number[];
};

/**
 * The household the user is currently looking at: the one pinned in the cookie
 * if they are still a member of it, otherwise the one they joined first.
 */
export async function getActiveHousehold(userId: string): Promise<ActiveHousehold | null> {
  const jar = await cookies();
  const pinned = jar.get(ACTIVE_HOUSEHOLD_COOKIE)?.value;

  const rows = await db
    .select({
      id: households.id,
      name: households.name,
      code: households.code,
      timezone: households.timezone,
      cookName: households.cookName,
      role: householdMembers.role,
      breakfastLockAt: households.breakfastLockAt,
      lunchLockAt: households.lunchLockAt,
      dinnerLockAt: households.dinnerLockAt,
      cookOffDays: households.cookOffDays,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, userId))
    .orderBy(asc(householdMembers.joinedAt));

  if (rows.length === 0) return null;
  return rows.find((r) => r.id === pinned) ?? rows[0];
}

/**
 * The user and their active household in a single round trip.
 *
 * The signed-in layout needs both on every full page load, and this runs against a
 * database in another region — so one query rather than two is worth the small amount
 * of duplication. Returns null when the cookie is valid but the account is gone.
 */
export async function getSession(): Promise<{ user: SessionUser; household: ActiveHousehold | null } | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const jar = await cookies();
  const pinned = jar.get(ACTIVE_HOUSEHOLD_COOKIE)?.value;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      emoji: users.emoji,
      householdId: households.id,
      householdName: households.name,
      code: households.code,
      timezone: households.timezone,
      cookName: households.cookName,
      role: householdMembers.role,
      breakfastLockAt: households.breakfastLockAt,
      lunchLockAt: households.lunchLockAt,
      dinnerLockAt: households.dinnerLockAt,
      cookOffDays: households.cookOffDays,
      joinedAt: householdMembers.joinedAt,
    })
    .from(users)
    .leftJoin(householdMembers, eq(householdMembers.userId, users.id))
    .leftJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(users.id, userId))
    .orderBy(asc(householdMembers.joinedAt));

  if (rows.length === 0) return null;

  const user: SessionUser = {
    id: rows[0].id,
    email: rows[0].email,
    name: rows[0].name,
    emoji: rows[0].emoji,
  };

  const memberships = rows.filter((r) => r.householdId !== null);
  const chosen = memberships.find((r) => r.householdId === pinned) ?? memberships[0];

  return {
    user,
    household: chosen
      ? {
          id: chosen.householdId!,
          name: chosen.householdName!,
          code: chosen.code!,
          timezone: chosen.timezone!,
          cookName: chosen.cookName,
          role: chosen.role!,
          breakfastLockAt: chosen.breakfastLockAt!,
          lunchLockAt: chosen.lunchLockAt!,
          dinnerLockAt: chosen.dinnerLockAt!,
          cookOffDays: chosen.cookOffDays ?? [],
        }
      : null,
  };
}

/** Throws if the user is not a member — use to guard every household-scoped route. */
export async function assertMember(userId: string, householdId: string) {
  const [row] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)))
    .limit(1);
  if (!row) throw new Error("FORBIDDEN");
}

export async function ensureProfile(userId: string) {
  await db.insert(profiles).values({ userId }).onConflictDoNothing();
}
