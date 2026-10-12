import { Router } from "express";

import { getPlanById } from "../db/queries/plans.js";
import {
  createUser,
  getUserByExternalId,
  updateUserPlan,
} from "../db/queries/users.js";
import { PREDEFINED_PLAN_IDS } from "../db/seed.js";
import type { Account } from "../db/schema.js";
import { canUsePlan } from "../services/plans.js";
import { isUuid } from "../validation.js";

export const usersRouter = Router();

usersRouter.post("/", async (req, res) => {
  const account: Account = res.locals.account;
  const externalId = req.body?.externalId;
  const planId = req.body?.planId ?? PREDEFINED_PLAN_IDS.basic;

  if (typeof externalId !== "string" || externalId.trim() === "") {
    res.status(400).json({ error: "externalId is required" });
    return;
  }
  if (!isUuid(planId)) {
    res.status(400).json({ error: "planId must be a valid UUID" });
    return;
  }

  const plan = await getPlanById(planId);
  if (!canUsePlan(plan, account, "user")) {
    res.status(404).json({ error: "plan not found" });
    return;
  }

  const user = await createUser(account.id, externalId.trim(), plan.id);
  if (!user) {
    res.status(409).json({ error: "user already exists" });
    return;
  }

  res.status(201).json(user);
});

usersRouter.get("/:externalId", async (req, res) => {
  const account: Account = res.locals.account;
  const externalId = req.params.externalId;

  if (typeof externalId !== "string") {
    res.status(400).json({ error: "invalid user id" });
    return;
  }

  const user = await getUserByExternalId(account.id, externalId);
  if (!user) {
    res.status(404).json({ error: "user not found" });
    return;
  }

  res.json(user);
});

usersRouter.put("/:externalId/plan", async (req, res) => {
  const account: Account = res.locals.account;
  const externalId = req.params.externalId;
  const planId = req.body?.planId;

  if (typeof externalId !== "string") {
    res.status(400).json({ error: "invalid user id" });
    return;
  }
  if (!isUuid(planId)) {
    res.status(400).json({ error: "planId must be a valid UUID" });
    return;
  }

  const plan = await getPlanById(planId);
  if (!canUsePlan(plan, account, "user")) {
    res.status(404).json({ error: "plan not found" });
    return;
  }

  const user = await updateUserPlan(account.id, externalId, plan.id);
  if (!user) {
    res.status(404).json({ error: "user not found" });
    return;
  }

  res.json(user);
});