import type { Account, Plan } from "../db/schema.js";

export function canUsePlan(
  plan: Plan | undefined,
  account: Account,
  kind: "account" | "user",
): plan is Plan {
  return (
    plan !== undefined &&
    plan.kind === kind &&
    (plan.accountId === null || plan.accountId === account.id)
  );
}