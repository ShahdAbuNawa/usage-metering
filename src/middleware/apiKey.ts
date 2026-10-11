import type { NextFunction, Request, Response } from "express";

import { hashApiKey } from "../auth.js";
import { getAccountByApiKeyHash } from "../db/queries/accounts.js";

export async function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const key = req.get("X-API-Key");
  if (!key) {
    res.status(401).json({ error: "missing API key" });
    return;
  }

  const account = await getAccountByApiKeyHash(hashApiKey(key));
  if (!account) {
    res.status(401).json({ error: "invalid API key" });
    return;
  }

  res.locals.account = account;
  next();
}