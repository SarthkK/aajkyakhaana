import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword, createSession, ensureProfile } from "@/lib/auth";
import { handler, json, ApiError } from "@/lib/api";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("That email does not look right"),
  password: z.string().min(1, "Enter your password"),
});

export const POST = handler(async (req: Request) => {
  const { email, password } = schema.parse(await req.json());

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Same message either way so the form cannot be used to discover who has an account.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError("Wrong email or password", 401);
  }

  await ensureProfile(user.id);
  await createSession(user.id);

  return json({ user: { id: user.id, name: user.name, email: user.email, emoji: user.emoji } });
});
