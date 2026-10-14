
const BASE_URL =
  process.env.METERING_BASE_URL ?? "http://localhost:8080";

type CreatedAccount = {
  id: string;
  name: string;
  apiKey: string;
};

type Plan = {
  id: string;
  name: string;
  kind: "account" | "user";
  monthlyAllowance: number;
  maxPerRequest: number;
};

// A reusable function for calling our API.
async function apiRequest<T>(
  path: string,
  method: "GET" | "POST" | "PUT",
  apiKey?: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};

  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `${method} ${path} failed with status ${response.status}: ${await response.text()}`,
    );
  }

  return (await response.json()) as T;
}
type ConsumptionDecision = {
  accepted: boolean;
  rejectedScope: "account" | "user" | null;
  rejectedRule: "max_per_request" | "monthly_allowance" | null;
};

type UsageSummary = {
  monthlyAllowance: number;
  unitsUsed: number;
  unitsRemaining: number;
};
async function main() {
  console.log("=== Usage Metering Example Client ===");

  // Create a fresh demonstration account.
  const account = await apiRequest<CreatedAccount>(
    "/accounts",
    "POST",
    undefined,
    { name: "Example Application" },
  );

  console.log(`Created account: ${account.name}`);
  console.log(`Account ID: ${account.id}`);

  // Use the new account's API key to retrieve plans.
  const plans = await apiRequest<Plan[]>(
    "/plans",
    "GET",
    account.apiKey,
  );

  console.log("\nAvailable plans:");

  for (const plan of plans) {
    console.log(
      `${plan.name} (${plan.kind}): ${plan.monthlyAllowance} units/month, ${plan.maxPerRequest} per request`,
    );
  }
  
  // Find the two predefined user plans.
  const basicPlan = plans.find(
    (plan) => plan.name === "Basic" && plan.kind === "user",
  );

  const premiumPlan = plans.find(
    (plan) => plan.name === "Premium" && plan.kind === "user",
  );

  if (!basicPlan || !premiumPlan) {
    throw new Error("Required user plans were not found");
  }

  // Register a user with the Basic plan.
  const basicUser = await apiRequest<{
    externalId: string;
    planId: string;
  }>("/users", "POST", account.apiKey, {
    externalId: "demo-basic",
    planId: basicPlan.id,
  });

  // Register another user with the Premium plan.
  const premiumUser = await apiRequest<{
    externalId: string;
    planId: string;
  }>("/users", "POST", account.apiKey, {
    externalId: "demo-premium",
    planId: premiumPlan.id,
  });

  console.log("\nCreated demonstration users:");
  console.log(`${basicUser.externalId} -> Basic plan`);
  console.log(`${premiumUser.externalId} -> Premium plan`);

  // Helper for consuming units on behalf of a user.
  async function consume(
    externalId: string,
    requestId: string,
    units: number,
  ) {
    return apiRequest<ConsumptionDecision>(
      "/consume",
      "POST",
      account.apiKey,
      { externalId, requestId, units },
    );
  }

  console.log("\n=== Consumption Demonstration ===");

  // Basic user: 10 units should be accepted.
  const basicAccepted = await consume(
    basicUser.externalId,
    "demo-basic-accepted",
    10,
  );

  console.log("Basic user requests 10:", basicAccepted);

  // Premium user: 25 units should be accepted.
  const premiumAccepted = await consume(
    premiumUser.externalId,
    "demo-premium-accepted",
    25,
  );

  console.log("Premium user requests 25:", premiumAccepted);

  // Basic user: 25 exceeds their per-request limit of 20.
  const basicRejected = await consume(
    basicUser.externalId,
    "demo-basic-rejected",
    25,
  );

  console.log("Basic user requests 25:", basicRejected);

  // Verify our demonstration behaved as expected.
  if (
    !basicAccepted.accepted ||
    !premiumAccepted.accepted ||
    basicRejected.accepted ||
    basicRejected.rejectedScope !== "user" ||
    basicRejected.rejectedRule !== "max_per_request"
  ) {
    throw new Error("Unexpected consumption decisions");
  }

  // Display remaining allowances after the requests.
  const accountUsage = await apiRequest<UsageSummary>(
    "/usage",
    "GET",
    account.apiKey,
  );

  const basicUsage = await apiRequest<UsageSummary>(
    `/usage/users/${basicUser.externalId}`,
    "GET",
    account.apiKey,
  );

  const premiumUsage = await apiRequest<UsageSummary>(
    `/usage/users/${premiumUser.externalId}`,
    "GET",
    account.apiKey,
  );

  console.log("\n=== Remaining Allowances ===");

  console.log("Account:", accountUsage);
  console.log("Basic user:", basicUsage);
  console.log("Premium user:", premiumUsage);

  console.log("\n=== Shared Account Limit Demonstration ===");

  // Create a custom account plan with only 40 units per month.
  const customPlan = await apiRequest<{ id: string }>(
    "/plans",
    "POST",
    account.apiKey,
    {
      name: "Demo Shared Account Plan",
      kind: "account",
      monthlyAllowance: 40,
      maxPerRequest: 100,
    },
  );

  // Assign the custom plan to our account.
  await apiRequest(
    "/me/plan",
    "PUT",
    account.apiKey,
    { planId: customPlan.id },
  );

  const usageBefore = await apiRequest<UsageSummary>(
    "/usage",
    "GET",
    account.apiKey,
  );

  console.log("Account after switching plans:", usageBefore);

  // Our account already used 35 units.
  // Only 5 remain, so requesting 10 must fail.
  const sharedRejected = await consume(
    premiumUser.externalId,
    "demo-shared-rejected",
    10,
  );

  console.log("Premium requests 10:", sharedRejected);

  if (
    sharedRejected.accepted ||
    sharedRejected.rejectedScope !== "account" ||
    sharedRejected.rejectedRule !== "monthly_allowance"
  ) {
    throw new Error("Expected rejection by shared account limit");
  }

  // Increase the SAME custom plan's monthly allowance.
  await apiRequest(
    `/plans/${customPlan.id}`,
    "PUT",
    account.apiKey,
    { monthlyAllowance: 60 },
  );

  console.log("\nAccount plan increased from 40 to 60 units");

  // Use a NEW request ID because this is a new action.
  const sharedAccepted = await consume(
    premiumUser.externalId,
    "demo-shared-accepted",
    10,
  );

  console.log("Premium requests 10 again:", sharedAccepted);

  if (!sharedAccepted.accepted) {
    throw new Error("Expected acceptance after increasing allowance");
  }

  const finalAccountUsage = await apiRequest<UsageSummary>(
    "/usage",
    "GET",
    account.apiKey,
  );

  console.log("\nFinal account usage:", finalAccountUsage);

  if (
    finalAccountUsage.unitsUsed !== 45 ||
    finalAccountUsage.unitsRemaining !== 15
  ) {
    throw new Error("Unexpected final account usage");
  }

}

main().catch((error) => {
  console.error("Example client failed:", error);
  process.exitCode = 1;
});
