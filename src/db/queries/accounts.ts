import { db } from "../index.js";
import { accounts } from "../schema.js";

export async function createAccount(
  name: string,
  apiKeyHash: string,
  accountPlanId: string,
) {
  const [result] = await db
    .insert(accounts)
    .values({ name, apiKeyHash, accountPlanId })
    .returning();
  return result;
}