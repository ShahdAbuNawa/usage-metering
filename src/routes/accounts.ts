import { Router } from "express";

import { generateApiKey, hashApiKey } from "../auth.js";
import { createAccount } from "../db/queries/accounts.js";
import { PREDEFINED_PLAN_IDS } from "../db/seed.js";

export const accountsRouter = Router();

accountsRouter.post("/", async (req, res) => {
  const name = req.body?.name;
  if (typeof name !== "string" || name.trim() === "") {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const apiKey = generateApiKey();
  const account = await createAccount(
    name.trim(),
    hashApiKey(apiKey),
    PREDEFINED_PLAN_IDS.starter,
  );

  res.status(201).json({
    id: account.id,
    name: account.name,
    accountPlanId: account.accountPlanId,
    createdAt: account.createdAt,
    apiKey,
  });
});