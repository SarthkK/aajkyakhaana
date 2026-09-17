import { requireContext, handler, json, ApiError } from "@/lib/api";
import { summarizeDay } from "@/lib/summary";
import { isValidDate, todayIn } from "@/lib/dates";

export const GET = handler(async (req: Request) => {
  const { household } = await requireContext();
  const date = new URL(req.url).searchParams.get("date") ?? todayIn(household.timezone);
  if (!isValidDate(date)) throw new ApiError("Bad date");
  return json(await summarizeDay(household.id, date));
});
