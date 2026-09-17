import { z } from "zod";
import { eq, asc, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { shoppingItems, users } from "@/lib/db/schema";
import { requireContext, handler, json } from "@/lib/api";

const createSchema = z.object({
  name: z.string().trim().min(1, "What do you need?").max(120),
  quantity: z.coerce.number().min(0).max(100000).nullable().optional(),
  unit: z.string().trim().max(20).nullable().optional(),
  category: z.string().trim().max(20).default("other"),
  note: z.string().trim().max(200).nullable().optional(),
});

export const GET = handler(async () => {
  const { household } = await requireContext();

  const rows = await db
    .select({
      item: shoppingItems,
      addedByName: users.name,
      addedByEmoji: users.emoji,
    })
    .from(shoppingItems)
    .leftJoin(users, eq(users.id, shoppingItems.addedBy))
    .where(eq(shoppingItems.householdId, household.id))
    .orderBy(asc(shoppingItems.checked), asc(shoppingItems.category), desc(shoppingItems.createdAt));

  return json({
    items: rows.map((r) => ({ ...r.item, addedByName: r.addedByName, addedByEmoji: r.addedByEmoji })),
  });
});

export const POST = handler(async (req: Request) => {
  const { userId, household } = await requireContext();
  const input = createSchema.parse(await req.json());

  const [item] = await db
    .insert(shoppingItems)
    .values({
      householdId: household.id,
      name: input.name,
      quantity: input.quantity != null ? String(input.quantity) : null,
      unit: input.unit ?? null,
      category: input.category,
      note: input.note ?? null,
      source: "manual",
      addedBy: userId,
    })
    .returning();

  return json({ item }, 201);
});
