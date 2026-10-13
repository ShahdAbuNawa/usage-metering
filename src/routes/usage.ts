
import { Router } from "express";
import { and, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { accountUsage, userUsage, plans } from "../db/schema.js";
import type { Account } from "../db/schema.js";
import { getUserByExternalId } from "../db/queries/users.js";

export const usageRouter = Router();

usageRouter.get("/", async (req, res) => {
  const account: Account = res.locals.account;

  // Identify the current month in UTC.
const period = req.query.period ?? new Date().toISOString().slice(0, 7);

if (
  typeof period !== "string" ||
  !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)
) {
  res.status(400).json({
    error: "period must be YYYY-MM",
  });
  return;
}
  // Find the account's current plan.
  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.id, account.accountPlanId));

  if (!plan) {
    throw new Error("Account plan not found");
  }

  // Find this account's usage for the current month.
  const [usage] = await db
    .select()
    .from(accountUsage)
    .where(
      and(
        eq(accountUsage.accountId, account.id),
        eq(accountUsage.period, period),
      ),
    );

  // New accounts may not have a usage record yet.
  const unitsUsed = usage?.unitsUsed ?? 0;

  const unitsRemaining = Math.max(
    0,
    plan.monthlyAllowance - unitsUsed,
  );

  res.json({
    accountId: account.id,
    period,
    planId: plan.id,
    monthlyAllowance: plan.monthlyAllowance,
    maxPerRequest: plan.maxPerRequest,
    unitsUsed,
    unitsRemaining,
  });
});

usageRouter.get("/users/:externalId", async (req, res) => {
  const account: Account = res.locals.account;
  const externalId = req.params.externalId;

  if (typeof externalId !== "string" || externalId.trim() === "") {
    res.status(400).json({ error: "invalid user id" });
    return;
  }

  // Only find a user belonging to the authenticated account.
  const user = await getUserByExternalId(account.id, externalId);

  if (!user) {
    res.status(404).json({ error: "user not found" });
    return;
  }

const period = req.query.period ?? new Date().toISOString().slice(0, 7);

if (
  typeof period !== "string" ||
  !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)
) {
  res.status(400).json({
    error: "period must be YYYY-MM",
  });
  return;
}
  // Retrieve the user's current plan.
  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.id, user.planId));

  if (!plan) {
    throw new Error("User plan not found");
  }

  // Retrieve the user's monthly usage.
  const [usage] = await db
    .select()
    .from(userUsage)
    .where(
      and(
        eq(userUsage.userId, user.id),
        eq(userUsage.period, period),
      ),
    );

  const unitsUsed = usage?.unitsUsed ?? 0;

  res.json({
    externalId: user.externalId,
    period,
    planId: plan.id,
    monthlyAllowance: plan.monthlyAllowance,
    maxPerRequest: plan.maxPerRequest,
    unitsUsed,
    unitsRemaining: Math.max(
      0,
      plan.monthlyAllowance - unitsUsed,
    ),
  });
});