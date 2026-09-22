import { z } from "zod";
import { requireContext, handler, json, ApiError } from "@/lib/api";
import { aiEnabled, missingKeyName } from "@/lib/ai/client";
import { buildSuggestions } from "@/lib/services/suggest";
import { summarizeDay } from "@/lib/summary";
import { isValidDate } from "@/lib/dates";

export const maxDuration = 60;

const schema = z.object({
  date: z.string().refine(isValidDate, "Pick a valid date"),
  slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
});

/** "Nobody has added anything — what should we eat?" */
export const POST = handler(async (req: Request) => {
  const { household } = await requireContext();
  if (!aiEnabled()) throw new ApiError(`AI is not configured. Add ${missingKeyName()} on the server.`, 503);

  const { date, slot } = schema.parse(await req.json());

  const [suggestions, summary] = await Promise.all([
    buildSuggestions({ household, date, slot }),
    summarizeDay(household.id, date),
  ]);

  return json({ suggestions, gaps: summary.gaps.slice(0, 5) });
});
