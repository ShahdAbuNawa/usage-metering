import { Router } from "express";

import type { Account } from "../db/schema.js";

export const meRouter = Router();

meRouter.get("/", (req, res) => {
  const account: Account = res.locals.account;
  res.json({
    id: account.id,
    name: account.name,
    accountPlanId: account.accountPlanId,
  });
});