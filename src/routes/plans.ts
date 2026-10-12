import { Router } from "express";

import {
  createPlan,
  getPlanById,
  listPlansForAccount,
  updatePlan,
} from "../db/queries/plans.js";
import type { Account } from "../db/schema.js";
import { isNonNegativeInt, isPositiveInt, isUuid } from "../validation.js";

export const plansRouter = Router();

plansRouter.post("/", async (req, res) => {
  const account: Account = res.locals.account;
  const { name, kind, monthlyAllowance, maxPerRequest } = req.body ?? {};

  if (typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (kind !== "account" && kind !== "user") {
    res.status(400).json({ error: "kind must be 'account' or 'user'" });
    return;
  }
  if (!isNonNegativeInt(monthlyAllowance)) {
    res
      .status(400)
      .json({ error: "monthlyAllowance must be a whole number, 0 or more" });
    return;
  }
  if (!isPositiveInt(maxPerRequest)) {
    res
      .status(400)
      .json({ error: "maxPerRequest must be a whole number, 1 or more" });
    return;
  }

  const plan = await createPlan({
    accountId: account.id,
    kind,
    name: name.trim(),
    monthlyAllowance,
    maxPerRequest,
  });
  res.status(201).json(plan);
});

plansRouter.get("/", async (req, res) => {
  const account: Account = res.locals.account;
  const plans = await listPlansForAccount(account.id);
  res.json(plans);
});

plansRouter.get("/:planId", async (req, res) => {
  const account: Account = res.locals.account;
  const planId = req.params.planId;

  if (!isUuid(planId)) {
    res.status(400).json({ error: "planId must be a valid UUID" });
    return;
  }

  const plan = await getPlanById(planId);
  if (!plan || (plan.accountId !== null && plan.accountId !== account.id)) {
    res.status(404).json({ error: "plan not found" });
    return;
  }

  res.json(plan);
});

plansRouter.put("/:planId", async (req, res) => {
  const account: Account = res.locals.account;
  const planId = req.params.planId;

  if (!isUuid(planId)) {
    res.status(400).json({ error: "planId must be a valid UUID" });
    return;
  }

  const plan = await getPlanById(planId);
  if (!plan || (plan.accountId !== null && plan.accountId !== account.id)) {
    res.status(404).json({ error: "plan not found" });
    return;
  }
  if (plan.accountId === null) {
    res.status(403).json({ error: "predefined plans are read-only" });
    return;
  }

  const { name, monthlyAllowance, maxPerRequest } = req.body ?? {};
  const changes: {
    name?: string;
    monthlyAllowance?: number;
    maxPerRequest?: number;
  } = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim() === "") {
      res.status(400).json({ error: "name must be a non-empty string" });
      return;
    }
    changes.name = name.trim();
  }
  if (monthlyAllowance !== undefined) {
    if (!isNonNegativeInt(monthlyAllowance)) {
      res
        .status(400)
        .json({ error: "monthlyAllowance must be a whole number, 0 or more" });
      return;
    }
    changes.monthlyAllowance = monthlyAllowance;
  }
  if (maxPerRequest !== undefined) {
    if (!isPositiveInt(maxPerRequest)) {
      res
        .status(400)
        .json({ error: "maxPerRequest must be a whole number, 1 or more" });
      return;
    }
    changes.maxPerRequest = maxPerRequest;
  }

  if (Object.keys(changes).length === 0) {
    res.status(400).json({ error: "nothing to update" });
    return;
  }

  const updated = await updatePlan(plan.id, account.id, changes);
  res.json(updated);
});