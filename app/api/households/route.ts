import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { households, householdMembers } from "@/lib/db/schema";
import { requireUserId, handler, json, ApiError } from "@/lib/api";
import { setActiveHousehold } from "@/lib/auth";
import { generateJoinCode } from "@/lib/code";

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
