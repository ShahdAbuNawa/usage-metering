import { describe, expect, it } from "vitest";
import { checkUsageLimits } from "../src/services/usageRules.ts";

const accountPlan = {
  monthlyAllowance: 100,
  maxPerRequest: 10,
};

const userPlan = {
  monthlyAllowance: 50,
  maxPerRequest: 5,
};

describe("checkUsageLimits", () => {
  it("accepts a request within all four limits", () => {
    const result = checkUsageLimits(
      5,
      accountPlan,
      userPlan,
      95,
      45,
    );

    expect(result).toEqual({
      accepted: true,
      rejectedScope: null,
      rejectedRule: null,
    });
  });

  it.each([
    ["account per-request", 11, 0, 0, "account", "max_per_request"],
    ["user per-request", 6, 0, 0, "user", "max_per_request"],
    ["account monthly", 4, 98, 0, "account", "monthly_allowance"],
    ["user monthly", 4, 0, 48, "user", "monthly_allowance"],
  ] as const)(
    "rejects when %s limit is exceeded",
    (_description, units, accountUsed, userUsed, scope, rule) => {
      const result = checkUsageLimits(
        units,
        accountPlan,
        userPlan,
        accountUsed,
        userUsed,
      );

      expect(result).toEqual({
        accepted: false,
        rejectedScope: scope,
        rejectedRule: rule,
      });
    },
  );
});