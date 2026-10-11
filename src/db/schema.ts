import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  unique,
  index,
  primaryKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  // NULL means a predefined plan (shared by everyone, read-only)
  accountId: uuid("account_id").references((): AnyPgColumn => accounts.id, {
    onDelete: "cascade",
  }),
  kind: text("kind", { enum: ["account", "user"] }).notNull(),
  name: text("name").notNull(),
  monthlyAllowance: integer("monthly_allowance").notNull(),
  maxPerRequest: integer("max_per_request").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom().notNull(),
  name: text("name").notNull(),
  apiKeyHash: text("api_key_hash").notNull().unique(),
  accountPlanId: uuid("account_plan_id")
    .notNull()
    .references(() => plans.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    // the calling application's own ID for this user
    externalId: text("external_id").notNull(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique().on(t.accountId, t.externalId)],
);

// one row per account per month, e.g. period = "2026-10"
export const accountUsage = pgTable(
  "account_usage",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    unitsUsed: integer("units_used").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.period] })],
);

// one row per user per month
export const userUsage = pgTable(
  "user_usage",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    unitsUsed: integer("units_used").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.period] })],
);

// full history of every decision, accepted or rejected
export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    units: integer("units").notNull(),
    accepted: boolean("accepted").notNull(),
    rejectedRule: text("rejected_rule", {
      enum: ["max_per_request", "monthly_allowance"],
    }),
    rejectedScope: text("rejected_scope", { enum: ["account", "user"] }),
    period: text("period").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.accountId, t.requestId),
    index("requests_account_created_idx").on(t.accountId, t.createdAt),
    index("requests_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export type Plan = typeof plans.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type User = typeof users.$inferSelect;
export type RequestRecord = typeof requests.$inferSelect;