import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword, createSession, ensureProfile } from "@/lib/auth";
import { handler, json, ApiError } from "@/lib/api";

const schema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(60),
  email: z.string().trim().toLowerCase().email("That email does not look right"),
  password: z.string().min(8, "Password needs at least 8 characters").max(200),
});

export const POST = handler(async (req: Request) => {
  const { name, email, password } = schema.parse(await req.json());

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new ApiError("That email is already registered. Try signing in.", 409);

  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash: await hashPassword(password) })
    .returning({ id: users.id, name: users.name, email: users.email, emoji: users.emoji });

  await ensureProfile(user.id);
  await createSession(user.id);

  return json({ user });
});
