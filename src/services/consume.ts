import { and, eq, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  accounts,
  users,
  plans,
  accountUsage,
  userUsage,
  requests,
} from "../db/schema.js";
import { checkUsageLimits } from "./usageRules.js";

export type ConsumeResult =
  | { status: "user_not_found" }
  | { status: "conflict" }
  | {
      status: "ok";
      requestId: string;
      accepted: boolean;
      rejectedScope: "account" | "user" | null;
      rejectedRule: "max_per_request" | "monthly_allowance" | null;
      period: string;
      replayed: boolean;
    };

export async function consumeUnits(
  accountId: string,
  externalId: string,
  requestId: string,
  units: number,
): Promise<ConsumeResult> {
  return db.transaction(
    async (tx): Promise<ConsumeResult> => {
      // Lock the account so its consumption requests run one at a time.
      const [account] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for("update");

      if (!account) {
        throw new Error("Account no longer exists");
      }

      // Find and lock a user belonging to this account.
      const [user] = await tx
        .select()
        .from(users)
        .where(
          and(
            eq(users.accountId, accountId),
            eq(users.externalId, externalId),
          ),
        )
        .for("update");

      if (!user) {
        return { status: "user_not_found" };
      }

      // Idempotency: check whether this request was processed before.
      const [previous] = await tx
        .select()
        .from(requests)
        .where(
          and(
            eq(requests.accountId, accountId),
            eq(requests.requestId, requestId),
          ),
        );

      if (previous) {
        if (previous.userId !== user.id || previous.units !== units) {
          return { status: "conflict" };
        }

        return {
          status: "ok",
          requestId,
          accepted: previous.accepted,
          rejectedScope: previous.rejectedScope,
          rejectedRule: previous.rejectedRule,
          period: previous.period,
          replayed: true,
        };
      }

      // Retrieve and lock the current account and user plans.
      const [accountPlan] = await tx
        .select()
        .from(plans)
        .where(eq(plans.id, account.accountPlanId))
        .for("share");

      const [userPlan] = await tx
        .select()
        .from(plans)
        .where(eq(plans.id, user.planId))
        .for("share");

      if (!accountPlan || !userPlan) {
        throw new Error("Assigned plan not found");
      }

      // Monthly periods use UTC, e.g. "2026-10".
      const period = new Date().toISOString().slice(0, 7);

      const [accountCounter] = await tx
        .select()
        .from(accountUsage)
        .where(
          and(
            eq(accountUsage.accountId, accountId),
            eq(accountUsage.period, period),
          ),
        );

      const [userCounter] = await tx
        .select()
        .from(userUsage)
        .where(
          and(
            eq(userUsage.userId, user.id),
            eq(userUsage.period, period),
          ),
        );

      // Run the four business-rule checks.
      const decision = checkUsageLimits(
        units,
        accountPlan,
        userPlan,
        accountCounter?.unitsUsed ?? 0,
        userCounter?.unitsUsed ?? 0,
      );

      // Record every new decision, including rejections.
      await tx.insert(requests).values({
        accountId,
        userId: user.id,
        requestId,
        units,
        accepted: decision.accepted,
        rejectedRule: decision.rejectedRule,
        rejectedScope: decision.rejectedScope,
        period,
      });

      // Only accepted requests increase usage.
      if (decision.accepted) {
        await tx
          .insert(accountUsage)
          .values({ accountId, period, unitsUsed: units })
          .onConflictDoUpdate({
            target: [accountUsage.accountId, accountUsage.period],
            set: {
              unitsUsed: sql`${accountUsage.unitsUsed} + ${units}`,
            },
          });

        await tx
          .insert(userUsage)
          .values({ userId: user.id, period, unitsUsed: units })
          .onConflictDoUpdate({
            target: [userUsage.userId, userUsage.period],
            set: {
              unitsUsed: sql`${userUsage.unitsUsed} + ${units}`,
            },
          });
      }

      return {
        status: "ok",
        requestId,
        accepted: decision.accepted,
        rejectedScope: decision.rejectedScope,
        rejectedRule: decision.rejectedRule,
        period,
        replayed: false,
      };
    },
    { isolationLevel: "read committed" },
  );
}
