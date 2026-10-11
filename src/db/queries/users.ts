import { and, eq } from "drizzle-orm";
import { db } from "../index.js";
import { users } from "../schema.js";

export async function createUser(
  accountId: string,
  externalId: string,
  planId: string,
) {
  const [result] = await db
    .insert(users)
    .values({ accountId, externalId, planId })
    .onConflictDoNothing()
    .returning();
  return result;
}

export async function getUserByExternalId(
  accountId: string,
  externalId: string,
) {
  const [result] = await db
    .select()
    .from(users)
    .where(and(eq(users.accountId, accountId), eq(users.externalId, externalId)));
  return result;
}