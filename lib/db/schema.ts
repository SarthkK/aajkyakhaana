import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  date,
  jsonb,
  smallint,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* ---------------------------------- users --------------------------------- */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🙂"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("users_email_key").on(t.email)]);

/** Body stats + dietary preferences. One row per user, used for macro targets. */
export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  sex: text("sex").$type<"male" | "female" | "other">(),
  age: integer("age"),
  heightCm: numeric("height_cm", { precision: 5, scale: 1 }),
  weightKg: numeric("weight_kg", { precision: 5, scale: 1 }),
  /** sedentary | light | moderate | active | very_active */
  activityLevel: text("activity_level").notNull().default("light"),
  /** lose | maintain | gain */
  goal: text("goal").notNull().default("maintain"),
  /** veg | egg | nonveg | vegan | jain */
  diet: text("diet").notNull().default("veg"),
  allergies: text("allergies").array().notNull().default([]),
  dislikes: text("dislikes").array().notNull().default([]),
  /** Manual override for daily kcal; null = computed from Mifflin-St Jeor. */
  calorieOverride: integer("calorie_override"),
  /** Someone proposed or changed a meal. */
  notifyMeals: boolean("notify_meals").notNull().default(true),
  /** Someone commented on a meal. */
  notifyComments: boolean("notify_comments").notNull().default(true),
  /** A slot resolved and the cook has an answer. */
  notifyLocks: boolean("notify_locks").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------- households ------------------------------- */

export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Short human-typeable join code, e.g. "KHA4R2". */
  code: text("code").notNull(),
  /** IANA timezone used to decide what "today" means for this flat. */
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  cookName: text("cook_name"),
  /**
   * Local times, "HH:MM", after which a slot stops taking proposals and resolves to a
   * winner. Set a little before the cook actually arrives so the answer is ready.
   */
  breakfastLockAt: text("breakfast_lock_at").notNull().default("07:00"),
  lunchLockAt: text("lunch_lock_at").notNull().default("10:30"),
  dinnerLockAt: text("dinner_lock_at").notNull().default("17:30"),
  /** Days the cook does not come. 0 = Sunday, matching JavaScript's getDay(). */
  cookOffDays: integer("cook_off_days").array().notNull().default([]),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("households_code_key").on(t.code)]);

export const householdMembers = pgTable("household_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** owner | member */
  role: text("role").notNull().default("member"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("household_members_unique").on(t.householdId, t.userId),
  index("household_members_user_idx").on(t.userId),
]);

/* ---------------------------------- dishes --------------------------------- */

/** Per-serving nutrition. Everything optional so a half-filled AI response still saves. */
export type Nutrition = {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  iron_mg?: number;
  calcium_mg?: number;
  zinc_mg?: number;
  magnesium_mg?: number;
  potassium_mg?: number;
  sodium_mg?: number;
  vitamin_a_mcg?: number;
  vitamin_c_mg?: number;
  vitamin_d_mcg?: number;
  vitamin_b12_mcg?: number;
  folate_mcg?: number;
};

/** The flat's dish library. Adding a dish here does not plan it. */
export const dishes = pgTable("dishes", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  /** breakfast | lunch | dinner | snack | any */
  course: text("course").notNull().default("any"),
  isVeg: boolean("is_veg").notNull().default(true),
  /** Servings the ingredient quantities below are scaled for. */
  baseServings: integer("base_servings").notNull().default(4),
  prepMinutes: integer("prep_minutes"),
  /** pending | ready | failed — status of the AI ingredient/nutrition lookup. */
  enrichStatus: text("enrich_status").notNull().default("pending"),
  enrichError: text("enrich_error"),
  /** Per serving, as returned by the AI and editable afterwards. */
  nutrition: jsonb("nutrition").$type<Nutrition>(),
  tags: text("tags").array().notNull().default([]),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("dishes_household_idx").on(t.householdId)]);

export const dishIngredients = pgTable("dish_ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  dishId: uuid("dish_id").notNull().references(() => dishes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }),
  /** g | kg | ml | l | tsp | tbsp | cup | piece | pinch | bunch | to taste */
  unit: text("unit").notNull().default("g"),
  /** produce | dairy | grains | pulses | spices | meat | other */
  category: text("category").notNull().default("other"),
  optional: boolean("optional").notNull().default(false),
  /** Staples like salt/oil that are always in the kitchen — skipped when building the list. */
  isPantryStaple: boolean("is_pantry_staple").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => [index("dish_ingredients_dish_idx").on(t.dishId)]);

/* --------------------------------- planning -------------------------------- */

/** One dish proposed for one slot on one day. */
export const planEntries = pgTable("plan_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  /** Local calendar date in the household's timezone, "YYYY-MM-DD". */
  date: date("date").notNull(),
  /** breakfast | lunch | dinner | snack */
  slot: text("slot").notNull(),
  dishId: uuid("dish_id").notNull().references(() => dishes.id, { onDelete: "cascade" }),
  servings: integer("servings"),
  note: text("note"),
  /** proposed | confirmed | cooked | cancelled */
  status: text("status").notNull().default("proposed"),
  /** True when the AI suggested it rather than a person. */
  suggested: boolean("suggested").notNull().default(false),
  addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("plan_entries_household_date_idx").on(t.householdId, t.date),
  uniqueIndex("plan_entries_no_dupes").on(t.householdId, t.date, t.slot, t.dishId),
]);

/** +1 / -1 per person per proposed dish. */
export const votes = pgTable("votes", {
  id: uuid("id").primaryKey().defaultRandom(),
  planEntryId: uuid("plan_entry_id").notNull().references(() => planEntries.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  value: smallint("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("votes_unique").on(t.planEntryId, t.userId)]);

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  planEntryId: uuid("plan_entry_id").notNull().references(() => planEntries.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("comments_entry_idx").on(t.planEntryId)]);

/* ------------------------------- shopping list ------------------------------ */

export const shoppingItems = pgTable("shopping_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }),
  unit: text("unit"),
  category: text("category").notNull().default("other"),
  /** manual | plan — plan items are generated from planned dishes. */
  source: text("source").notNull().default("manual"),
  /** Set for source=plan so we can explain why an item is on the list. */
  fromDate: date("from_date"),
  note: text("note"),
  checked: boolean("checked").notNull().default(false),
  checkedBy: uuid("checked_by").references(() => users.id, { onDelete: "set null" }),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("shopping_items_household_idx").on(t.householdId, t.checked)]);

/* ------------------------------ notifications ------------------------------ */

/**
 * One row per browser a person has granted notification permission in. People use
 * more than one device, and a subscription silently expires, so this is many-per-user
 * and rows get deleted when the push service reports them gone.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** The push service URL. Unique per browser install. */
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("push_subscriptions_endpoint_key").on(t.endpoint),
  index("push_subscriptions_user_idx").on(t.userId),
]);

/* -------------------------------- relations -------------------------------- */

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  memberships: many(householdMembers),
}));

export const householdsRelations = relations(households, ({ many }) => ({
  members: many(householdMembers),
  dishes: many(dishes),
  planEntries: many(planEntries),
  shoppingItems: many(shoppingItems),
}));

export const householdMembersRelations = relations(householdMembers, ({ one }) => ({
  household: one(households, { fields: [householdMembers.householdId], references: [households.id] }),
  user: one(users, { fields: [householdMembers.userId], references: [users.id] }),
}));

export const dishesRelations = relations(dishes, ({ one, many }) => ({
  household: one(households, { fields: [dishes.householdId], references: [households.id] }),
  ingredients: many(dishIngredients),
  creator: one(users, { fields: [dishes.createdBy], references: [users.id] }),
}));

export const dishIngredientsRelations = relations(dishIngredients, ({ one }) => ({
  dish: one(dishes, { fields: [dishIngredients.dishId], references: [dishes.id] }),
}));

export const planEntriesRelations = relations(planEntries, ({ one, many }) => ({
  dish: one(dishes, { fields: [planEntries.dishId], references: [dishes.id] }),
  addedByUser: one(users, { fields: [planEntries.addedBy], references: [users.id] }),
  votes: many(votes),
  comments: many(comments),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  entry: one(planEntries, { fields: [votes.planEntryId], references: [planEntries.id] }),
  user: one(users, { fields: [votes.userId], references: [users.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  entry: one(planEntries, { fields: [comments.planEntryId], references: [planEntries.id] }),
  user: one(users, { fields: [comments.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Household = typeof households.$inferSelect;
export type Dish = typeof dishes.$inferSelect;
export type DishIngredient = typeof dishIngredients.$inferSelect;
export type PlanEntry = typeof planEntries.$inferSelect;
export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
