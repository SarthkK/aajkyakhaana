import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { households, householdMembers } from "@/lib/db/schema";
import { requireUserId, requireContext, handler, json, ApiError } from "@/lib/api";
import { setActiveHousehold } from "@/lib/auth";
import { generateJoinCode } from "@/lib/code";
import { logger } from "@/lib/logger";

const log = logger("households");

const createSchema = z.object({
  name: z.string().trim().min(1, "Give your flat a name").max(60),
  cookName: z.string().trim().max(60).optional().nullable(),
  timezone: z.string().trim().max(60).default("Asia/Kolkata"),
});

/** Every household the signed-in user belongs to. */
export const GET = handler(async () => {
  const userId = await requireUserId();
  const rows = await db
    .select({
      id: households.id,
      name: households.name,
      code: households.code,
      cookName: households.cookName,
      role: householdMembers.role,
    })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(eq(householdMembers.userId, userId));
  return json({ households: rows });
});

export const POST = handler(async (req: Request) => {
  const userId = await requireUserId();
  const input = createSchema.parse(await req.json());

  // Codes are short, so retry on the rare collision rather than failing the request.
  let created: typeof households.$inferSelect | undefined;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const [row] = await db
      .insert(households)
      .values({
        name: input.name,
        cookName: input.cookName ?? null,
        timezone: input.timezone,
        code: generateJoinCode(),
        createdBy: userId,
      })
      .onConflictDoNothing({ target: households.code })
      .returning();
    created = row;
  }
  if (!created) throw new ApiError("Could not create the household, please try again", 500);

  await db.insert(householdMembers).values({ householdId: created.id, userId, role: "owner" });
  await setActiveHousehold(created.id);

  return json({ household: created }, 201);
});

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  cookName: z.string().trim().max(60).nullable().optional(),
  timezone: z.string().trim().max(60).optional(),
  breakfastLockAt: z.string().regex(HHMM, "Use a time like 07:00").optional(),
  lunchLockAt: z.string().regex(HHMM, "Use a time like 10:30").optional(),
  dinnerLockAt: z.string().regex(HHMM, "Use a time like 17:30").optional(),
  /** 0 = Sunday, matching Date#getDay. */
  cookOffDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
});

/** Flat-wide settings. Any member can change these — it is their shared kitchen. */
export const PATCH = handler(async (req: Request) => {
  const { userId, household } = await requireContext();
  const patch = patchSchema.parse(await req.json());
  if (Object.keys(patch).length === 0) throw new ApiError("Nothing to update");

  const [updated] = await db
    .update(households)
    .set({ ...patch, cookOffDays: patch.cookOffDays ? [...new Set(patch.cookOffDays)].sort() : undefined })
    .where(eq(households.id, household.id))
    .returning();

  log.info("household settings changed", { householdId: household.id, by: userId, fields: Object.keys(patch) });
  return json({ household: updated });
});
