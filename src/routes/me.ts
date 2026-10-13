
import { Router } from "express";
import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { accounts } from "../db/schema.js";
import type { Account } from "../db/schema.js";
import { getPlanById } from "../db/queries/plans.js";
import { canUsePlan } from "../services/plans.js";
import { isUuid } from "../validation.js";

export const meRouter = Router();

meRouter.get("/", (req, res) => {
  const account: Account = res.locals.account;

  res.json({
    id: account.id,
    name: account.name,
    accountPlanId: account.accountPlanId,
  });
});

meRouter.put("/plan", async (req, res) => {
  const account: Account = res.locals.account;
  const planId = req.body?.planId;

  if (!isUuid(planId)) {
    res.status(400).json({
      error: "planId must be a valid UUID",
    });
    return;
  }

  const plan = await getPlanById(planId);

  // Only account plans belonging to this account,
  // or shared predefined account plans, are allowed.
  if (!canUsePlan(plan, account, "account")) {
    res.status(404).json({
      error: "plan not found",
    });
    return;
  }

  const [updated] = await db
    .update(accounts)
    .set({ accountPlanId: plan.id })
    .where(eq(accounts.id, account.id))
    .returning({
      id: accounts.id,
      name: accounts.name,
      accountPlanId: accounts.accountPlanId,
    });

  if (!updated) {
    res.status(404).json({ error: "account not found" });
    return;
  }

  res.json(updated);
});
