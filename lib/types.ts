import type { Nutrition } from "@/lib/db/schema";

export type { Nutrition };

export type SessionUser = { id: string; name: string; email: string; emoji: string };

export type HouseholdInfo = {
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

export type Ingredient = {
  id: string;
  dishId: string;
  name: string;
  quantity: string | null;
  unit: string;
  category: string;
  optional: boolean;
  isPantryStaple: boolean;
  sortOrder: number;
};

export type DishWithIngredients = {
  id: string;
  name: string;
  description: string | null;
  course: string;
  isVeg: boolean;
  baseServings: number;
  prepMinutes: number | null;
  enrichStatus: "pending" | "ready" | "failed" | string;
  enrichError: string | null;
  nutrition: Nutrition | null;
  tags: string[];
  createdBy: string | null;
  createdAt: string;
  ingredients: Ingredient[];
};

export type Voter = { userId: string | null; name: string | null; emoji: string | null; value: number };

export type PlanEntryView = {
  id: string;
  date: string;
  slot: string;
  dishId: string;
  servings: number | null;
  note: string | null;
  status: string;
  suggested: boolean;
  addedBy: string | null;
  createdAt: string;
  dish: Omit<DishWithIngredients, "ingredients">;
  addedByName: string | null;
  addedByEmoji: string | null;
  myVote: number;
  upVotes: number;
  downVotes: number;
  voters: Voter[];
  commentCount: number;
};

export type PlanResponse = { from: string; to: string; today: string; entries: PlanEntryView[] };

export type CommentView = {
  id: string;
  body: string;
  createdAt: string;
  userId: string | null;
  name: string | null;
  emoji: string | null;
};

export type ShoppingItemView = {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  category: string;
  source: string;
  fromDate: string | null;
  note: string | null;
  checked: boolean;
  checkedBy: string | null;
  checkedAt: string | null;
  addedBy: string | null;
  createdAt: string;
  addedByName: string | null;
  addedByEmoji: string | null;
};

export type Targets = Record<string, number>;

export type MemberView = {
  userId: string;
  name: string;
  emoji: string;
  role?: string;
  diet: string;
  goal: string;
  allergies: string[];
  dislikes: string[];
  hasProfile?: boolean;
  targets: Targets | null;
  coverage?: Record<string, number>;
};

export type DaySummaryView = {
  date: string;
  perPerson: Nutrition;
  dishCount: number;
  members: MemberView[];
  gaps: { nutrient: string; label: string; pctOfTarget: number }[];
};

export type SuggestionView = {
  name: string;
  existing_dish_id: string | null;
  reason: string;
  nutrition_note?: string;
  is_veg: boolean;
  effort: string;
};

export type FeedMessage = {
  id: number;
  kind: "text" | "meal_added" | "meal_removed" | "meal_settled";
  body: string;
  planEntryId: string | null;
  meta: { dishName?: string; slot?: string; date?: string } | null;
  createdAt: string;
  userId: string | null;
  authorName: string | null;
  authorEmoji: string | null;
};
