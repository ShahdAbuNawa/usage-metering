import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../index.js";
import { plans } from "../schema.js";

export async function getPlanById(planId: string) {
  const [result] = await db.select().from(plans).where(eq(plans.id, planId));
  return result;
}

export async function createPlan(values: {
  accountId: string;
  kind: "account" | "user";
  name: string;
  monthlyAllowance: number;
  maxPerRequest: number;
}) {
  const [result] = await db.insert(plans).values(values).returning();
  return result;
}

export async function listPlansForAccount(accountId: string) {
  return await db
    .select()
    .from(plans)
    .where(or(isNull(plans.accountId), eq(plans.accountId, accountId)))
    .orderBy(plans.createdAt);
}

export async function updatePlan(
  planId: string,
  accountId: string,
  changes: { name?: string; monthlyAllowance?: number; maxPerRequest?: number },
) {
  const [result] = await db
    .update(plans)
    .set(changes)
    .where(and(eq(plans.id, planId), eq(plans.accountId, accountId)))
    .returning();
  return result;
}