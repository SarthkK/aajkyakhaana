import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getUserId, getActiveHousehold, type ActiveHousehold } from "@/lib/auth";
import { AiError } from "@/lib/ai/client";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/** Wraps a route handler so thrown ApiErrors/ZodErrors become clean JSON responses. */
export function handler<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: err.issues[0]?.message ?? "Invalid input", issues: err.issues },
          { status: 422 },
        );
      }
      if (err instanceof AiError) {
        // Already phrased for the person reading it; 503 so the UI can offer a retry.
        return NextResponse.json({ error: err.message }, { status: err.retryable ? 503 : 400 });
      }
      if (err instanceof Error && err.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Not your household" }, { status: 403 });
      }
      console.error("[api]", err);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export async function requireUserId(): Promise<string> {
  const id = await getUserId();
  if (!id) throw new ApiError("Please sign in", 401);
  return id;
}

/** Most routes need both: who is asking, and which flat they are acting in. */
export async function requireContext(): Promise<{ userId: string; household: ActiveHousehold }> {
  const userId = await requireUserId();
  const household = await getActiveHousehold(userId);
  if (!household) throw new ApiError("Join or create a household first", 409);
  return { userId, household };
}
