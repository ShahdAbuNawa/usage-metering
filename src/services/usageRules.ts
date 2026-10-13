import type { Plan } from "../db/schema.js";

type Limits = Pick<Plan, "monthlyAllowance" | "maxPerRequest">;

type Scope = "account" | "user";
type Rule = "max_per_request" | "monthly_allowance";

export type UsageDecision =
  | {
      accepted: true;
      rejectedScope: null;
      rejectedRule: null;
    }
  | {
      accepted: false;
      rejectedScope: Scope;
      rejectedRule: Rule;
    };

export function checkUsageLimits(
  units: number,
  accountPlan: Limits,
  userPlan: Limits,
  accountUnitsUsed: number,
  userUnitsUsed: number,
): UsageDecision {

  // Rule 1: Account per-request limit
  if (units > accountPlan.maxPerRequest) {
    return {
      accepted: false,
      rejectedScope: "account",
      rejectedRule: "max_per_request",
    };
  }

  // Rule 2: User per-request limit
  if (units > userPlan.maxPerRequest) {
    return {
      accepted: false,
      rejectedScope: "user",
      rejectedRule: "max_per_request",
    };
  }

  // Rule 3: Account monthly allowance
  if (units > accountPlan.monthlyAllowance - accountUnitsUsed) {
    return {
      accepted: false,
      rejectedScope: "account",
      rejectedRule: "monthly_allowance",
    };
  }

  // Rule 4: User monthly allowance
  if (units > userPlan.monthlyAllowance - userUnitsUsed) {
    return {
      accepted: false,
      rejectedScope: "user",
      rejectedRule: "monthly_allowance",
    };
  }

  return {
    accepted: true,
    rejectedScope: null,
    rejectedRule: null,
  };
}