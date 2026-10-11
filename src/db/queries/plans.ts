import { eq } from "drizzle-orm";
import { db } from "../index.js";
import { plans } from "../schema.js";

export async function getPlanById(planId: string) {
  const [result] = await db.select().from(plans).where(eq(plans.id, planId));
  return result;
}