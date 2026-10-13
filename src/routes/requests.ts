
import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { requests, users } from "../db/schema.js";
import type { Account } from "../db/schema.js";

export const requestsRouter = Router();

requestsRouter.get("/", async (req, res) => {
  const account: Account = res.locals.account;

  // Pagination: return 10 records by default.
  const rawLimit = req.query.limit ?? "10";
  const rawOffset = req.query.offset ?? "0";

  if (
    typeof rawLimit !== "string" ||
    typeof rawOffset !== "string" ||
    !/^\d+$/.test(rawLimit) ||
    !/^\d+$/.test(rawOffset)
  ) {
    res.status(400).json({ error: "invalid pagination values" });
    return;
  }

  const limit = Number(rawLimit);
  const offset = Number(rawOffset);

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    res.status(400).json({ error: "invalid pagination values" });
    return;
  }

  // Optionally filter history for one user.
  const externalId = req.query.externalId;

  if (
    externalId !== undefined &&
    (typeof externalId !== "string" || externalId.trim() === "")
  ) {
    res.status(400).json({ error: "invalid externalId" });
    return;
  }

  const records = await db
    .select({
      requestId: requests.requestId,
      externalId: users.externalId,
      units: requests.units,
      accepted: requests.accepted,
      rejectedScope: requests.rejectedScope,
      rejectedRule: requests.rejectedRule,
      period: requests.period,
      createdAt: requests.createdAt,
    })
    .from(requests)
    .innerJoin(users, eq(requests.userId, users.id))
    .where(
      and(
        eq(requests.accountId, account.id),
        externalId === undefined
          ? undefined
          : eq(users.externalId, externalId.trim()),
      ),
    )
    .orderBy(desc(requests.createdAt), desc(requests.id))
    .limit(limit + 1)
    .offset(offset);

  // Fetch one extra record to detect another page.
  const hasMore = records.length > limit;

  res.json({
    items: records.slice(0, limit),
    pagination: {
      limit,
      offset,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    },
  });
});
