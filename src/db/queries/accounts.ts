import { eq } from "drizzle-orm";
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

export async function getAccountByApiKeyHash(apiKeyHash: string) {
  const [result] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.apiKeyHash, apiKeyHash));
  return result;
}
