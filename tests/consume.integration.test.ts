
import { describe, expect, it } from "vitest";

const BASE_URL =
  process.env.METERING_BASE_URL ?? "http://localhost:8081";
describe("Consumption API integration", () => {
    it("consumes units only once when a request is retried", async () => {

        // Create a new test account.
        const accountResponse = await fetch(`${BASE_URL}/accounts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Integration Test Account" }),
        });

        expect(accountResponse.status).toBe(201);

        const { apiKey } = (await accountResponse.json()) as {
            apiKey: string;
        };

        const headers = {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
        };

        // Create a user with the predefined Basic plan.
        const userResponse = await fetch(`${BASE_URL}/users`, {
            method: "POST",
            headers,
            body: JSON.stringify({ externalId: "test-alice" }),
        });

        expect(userResponse.status).toBe(201);

        // Alice requests 4 units.
        const requestBody = JSON.stringify({
            externalId: "test-alice",
            requestId: "integration-request-001",
            units: 4,
        });

        const firstResponse = await fetch(`${BASE_URL}/consume`, {
            method: "POST",
            headers,
            body: requestBody,
        });

        expect(firstResponse.status).toBe(200);
        expect(await firstResponse.json()).toMatchObject({
            accepted: true,
            replayed: false,
        });

        // Retry the identical request.
        const retryResponse = await fetch(`${BASE_URL}/consume`, {
            method: "POST",
            headers,
            body: requestBody,
        });

        expect(retryResponse.status).toBe(200);
        expect(await retryResponse.json()).toMatchObject({
            accepted: true,
            replayed: true,
        });
        // Same request ID, but different units: reject the conflict.
        const conflictResponse = await fetch(`${BASE_URL}/consume`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                externalId: "test-alice",
                requestId: "integration-request-001",
                units: 5,
            }),
        });

        expect(conflictResponse.status).toBe(409);
        // Verify that only 4 units were consumed.
        const usageResponse = await fetch(
            `${BASE_URL}/usage/users/test-alice`,
            { headers },
        );

        expect(usageResponse.status).toBe(200);
        expect(await usageResponse.json()).toMatchObject({
            unitsUsed: 4,
            unitsRemaining: 996,
        });
    });


    it("does not consume units when a request exceeds the limit", async () => {
        // Create a separate account for this test.
        const accountResponse = await fetch(`${BASE_URL}/accounts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Rejection Test Account" }),
        });

        expect(accountResponse.status).toBe(201);

        const { apiKey } = (await accountResponse.json()) as {
            apiKey: string;
        };

        const headers = {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
        };

        // Create a user assigned to the Basic plan.
        const userResponse = await fetch(`${BASE_URL}/users`, {
            method: "POST",
            headers,
            body: JSON.stringify({ externalId: "test-bob" }),
        });

        expect(userResponse.status).toBe(201);

        // Basic allows at most 20 units per request.
        // Requesting 21 should be rejected.
        const consumeResponse = await fetch(`${BASE_URL}/consume`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                externalId: "test-bob",
                requestId: "rejection-test-001",
                units: 21,
            }),
        });

        expect(consumeResponse.status).toBe(200);

        expect(await consumeResponse.json()).toMatchObject({
            accepted: false,
            rejectedScope: "user",
            rejectedRule: "max_per_request",
        });

        // Check that Bob has consumed nothing.
        const usageResponse = await fetch(
            `${BASE_URL}/usage/users/test-bob`,
            { headers },
        );

        expect(usageResponse.status).toBe(200);

        expect(await usageResponse.json()).toMatchObject({
            unitsUsed: 0,
            unitsRemaining: 1000,
        });

        // Check that the account also consumed nothing.
        const accountUsageResponse = await fetch(
            `${BASE_URL}/usage`,
            { headers },
        );

        expect(accountUsageResponse.status).toBe(200);

        expect(await accountUsageResponse.json()).toMatchObject({
            unitsUsed: 0,
        });
    });

    it("preserves usage when a plan allowance is reduced", async () => {
        // 1. Create a new account.
        const accountResponse = await fetch(`${BASE_URL}/accounts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Plan Reduction Test Account" }),
        });

        expect(accountResponse.status).toBe(201);

        const { apiKey } = (await accountResponse.json()) as {
            apiKey: string;
        };

        const headers = {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
        };

        // 2. Create a custom ACCOUNT plan.
        const planResponse = await fetch(`${BASE_URL}/plans`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                name: "Flexible Account Plan",
                kind: "account",
                monthlyAllowance: 100,
                maxPerRequest: 100,
            }),
        });

        expect(planResponse.status).toBe(201);

        const { id: planId } = (await planResponse.json()) as {
            id: string;
        };

        // 3. Assign the custom plan to our account.
        const assignResponse = await fetch(`${BASE_URL}/me/plan`, {
            method: "PUT",
            headers,
            body: JSON.stringify({ planId }),
        });

        expect(assignResponse.status).toBe(200);

        // 4. Create a user with the default Basic plan.
        const userResponse = await fetch(`${BASE_URL}/users`, {
            method: "POST",
            headers,
            body: JSON.stringify({ externalId: "reduction-user" }),
        });

        expect(userResponse.status).toBe(201);

        // 5. Consume 60 units in three requests of 20.
        // Basic users can consume at most 20 per request.
        for (let i = 1; i <= 3; i++) {
            const response = await fetch(`${BASE_URL}/consume`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    externalId: "reduction-user",
                    requestId: `reduction-request-${i}`,
                    units: 20,
                }),
            });

            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({
                accepted: true,
            });
        }

        // 6. Check usage BEFORE reducing the plan.
        const beforeResponse = await fetch(`${BASE_URL}/usage`, {
            headers,
        });

        expect(beforeResponse.status).toBe(200);
        expect(await beforeResponse.json()).toMatchObject({
            monthlyAllowance: 100,
            unitsUsed: 60,
            unitsRemaining: 40,
        });

        // 7. Reduce the SAME plan from 100 to 40 units.
        const updateResponse = await fetch(
            `${BASE_URL}/plans/${planId}`,
            {
                method: "PUT",
                headers,
                body: JSON.stringify({
                    monthlyAllowance: 40,
                }),
            },
        );

        expect(updateResponse.status).toBe(200);

        // 8. Previously consumed units must remain unchanged.
        const afterResponse = await fetch(`${BASE_URL}/usage`, {
            headers,
        });

        expect(afterResponse.status).toBe(200);
        expect(await afterResponse.json()).toMatchObject({
            monthlyAllowance: 40,
            unitsUsed: 60,
            unitsRemaining: 0,
        });

        // 9. New consumption must be rejected.
        const rejectedResponse = await fetch(`${BASE_URL}/consume`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                externalId: "reduction-user",
                requestId: "reduction-request-4",
                units: 1,
            }),
        });

        expect(rejectedResponse.status).toBe(200);
        expect(await rejectedResponse.json()).toMatchObject({
            accepted: false,
            rejectedScope: "account",
            rejectedRule: "monthly_allowance",
        });

        // 10. Confirm the rejection did not increase usage.
        const finalResponse = await fetch(`${BASE_URL}/usage`, {
            headers,
        });

        expect(finalResponse.status).toBe(200);
        expect(await finalResponse.json()).toMatchObject({
            unitsUsed: 60,
            unitsRemaining: 0,
        });
    });

    it("rejects missing and invalid API keys", async () => {
        // Request without an API key.
        const missingKeyResponse = await fetch(
            `${BASE_URL}/usage`,
        );

        expect(missingKeyResponse.status).toBe(401);

        // Request with an invalid API key.
        const invalidKeyResponse = await fetch(
            `${BASE_URL}/usage`,
            {
                headers: {
                    "X-API-Key": "definitely-invalid-test-key",
                },
            },
        );

        expect(invalidKeyResponse.status).toBe(401);
    });

    it("keeps users and usage isolated between accounts", async () => {
        // 1. Create two independent accounts.
        async function createTestAccount(name: string) {
            const response = await fetch(`${BASE_URL}/accounts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });

            expect(response.status).toBe(201);

            return (await response.json()) as {
                apiKey: string;
            };
        }

        const accountA = await createTestAccount("Isolation Account A");
        const accountB = await createTestAccount("Isolation Account B");

        const headersA = {
            "Content-Type": "application/json",
            "X-API-Key": accountA.apiKey,
        };

        const headersB = {
            "Content-Type": "application/json",
            "X-API-Key": accountB.apiKey,
        };

        // 2. Create a user belonging ONLY to Account A.
        const userResponse = await fetch(`${BASE_URL}/users`, {
            method: "POST",
            headers: headersA,
            body: JSON.stringify({
                externalId: "private-user",
            }),
        });

        expect(userResponse.status).toBe(201);

        // 3. Consume 4 units for Account A's user.
        const consumeResponse = await fetch(`${BASE_URL}/consume`, {
            method: "POST",
            headers: headersA,
            body: JSON.stringify({
                externalId: "private-user",
                requestId: "isolation-request-001",
                units: 4,
            }),
        });

        expect(consumeResponse.status).toBe(200);
        expect(await consumeResponse.json()).toMatchObject({
            accepted: true,
        });

        // 4. Account A can view its user's usage.
        const ownUsageResponse = await fetch(
            `${BASE_URL}/usage/users/private-user`,
            { headers: headersA },
        );

        expect(ownUsageResponse.status).toBe(200);
        expect(await ownUsageResponse.json()).toMatchObject({
            unitsUsed: 4,
        });

        // 5. Account B cannot access Account A's user.
        const otherUserResponse = await fetch(
            `${BASE_URL}/users/private-user`,
            { headers: headersB },
        );

        expect(otherUserResponse.status).toBe(404);

        // 6. Account B cannot access that user's usage.
        const otherUsageResponse = await fetch(
            `${BASE_URL}/usage/users/private-user`,
            { headers: headersB },
        );

        expect(otherUsageResponse.status).toBe(404);

        // 7. Account B cannot see Account A's request history.
        const historyResponse = await fetch(
            `${BASE_URL}/requests?externalId=private-user`,
            { headers: headersB },
        );

        expect(historyResponse.status).toBe(200);

        const history = (await historyResponse.json()) as {
            items: unknown[];
        };

        expect(history.items).toEqual([]);

        // 8. Account B's own usage remains zero.
        const accountBUsageResponse = await fetch(
            `${BASE_URL}/usage`,
            { headers: headersB },
        );

        expect(accountBUsageResponse.status).toBe(200);
        expect(await accountBUsageResponse.json()).toMatchObject({
            unitsUsed: 0,
        });
    });

    it("keeps usage correct when requests arrive concurrently", async () => {
        // Create an isolated test account.
        const accountResponse = await fetch(`${BASE_URL}/accounts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Concurrency Integration Test" }),
        });

        expect(accountResponse.status).toBe(201);

        const { apiKey } = (await accountResponse.json()) as {
            apiKey: string;
        };

        const headers = {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
        };

        // Give the account a monthly allowance of 100 units.
        const planResponse = await fetch(`${BASE_URL}/plans`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                name: "Concurrency Account Plan",
                kind: "account",
                monthlyAllowance: 100,
                maxPerRequest: 20,
            }),
        });

        expect(planResponse.status).toBe(201);

        const { id: planId } = (await planResponse.json()) as {
            id: string;
        };

        const assignResponse = await fetch(`${BASE_URL}/me/plan`, {
            method: "PUT",
            headers,
            body: JSON.stringify({ planId }),
        });

        expect(assignResponse.status).toBe(200);

        // Create a user with the default Basic plan.
        const userResponse = await fetch(`${BASE_URL}/users`, {
            method: "POST",
            headers,
            body: JSON.stringify({ externalId: "concurrent-user" }),
        });

        expect(userResponse.status).toBe(201);

        // Send 12 different requests simultaneously.
        const responses = await Promise.all(
            Array.from({ length: 12 }, (_, i) =>
                fetch(`${BASE_URL}/consume`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        externalId: "concurrent-user",
                        requestId: `concurrent-request-${i}`,
                        units: 20,
                    }),
                }),
            ),
        );

        // All requests should receive valid API decisions.
        for (const response of responses) {
            expect(response.status).toBe(200);
        }

        const decisions = (await Promise.all(
            responses.map((response) => response.json()),
        )) as {
            accepted: boolean;
            rejectedScope: string | null;
            rejectedRule: string | null;
        }[];

        const accepted = decisions.filter((d) => d.accepted);
        const rejected = decisions.filter((d) => !d.accepted);

        expect(accepted).toHaveLength(5);
        expect(rejected).toHaveLength(7);

        for (const decision of rejected) {
            expect(decision.rejectedScope).toBe("account");
            expect(decision.rejectedRule).toBe("monthly_allowance");
        }

        // Even under concurrency, the account must not exceed 100 units.
        const usageResponse = await fetch(`${BASE_URL}/usage`, {
            headers,
        });

        expect(usageResponse.status).toBe(200);
        expect(await usageResponse.json()).toMatchObject({
            unitsUsed: 100,
            unitsRemaining: 0,
        });

        // The user should also have consumed exactly 100 units.
        const userUsageResponse = await fetch(
            `${BASE_URL}/usage/users/concurrent-user`,
            { headers },
        );

        expect(userUsageResponse.status).toBe(200);
        expect(await userUsageResponse.json()).toMatchObject({
            unitsUsed: 100,
            unitsRemaining: 900,
        });
    }, 15000);
it("prevents accounts from accessing each other's custom plans", async () => {
  async function createTestAccount(name: string) {
    const response = await fetch(`${BASE_URL}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    expect(response.status).toBe(201);
    return (await response.json()) as { apiKey: string };
  }

  const accountA = await createTestAccount("Plan Owner A");
  const accountB = await createTestAccount("Other Account B");

  const headersA = {
    "Content-Type": "application/json",
    "X-API-Key": accountA.apiKey,
  };

  const headersB = {
    "Content-Type": "application/json",
    "X-API-Key": accountB.apiKey,
  };

  // Account A creates its own custom user plan.
  const planResponse = await fetch(`${BASE_URL}/plans`, {
    method: "POST",
    headers: headersA,
    body: JSON.stringify({
      name: "Private Plan",
      kind: "user",
      monthlyAllowance: 100,
      maxPerRequest: 10,
    }),
  });

  expect(planResponse.status).toBe(201);
  const { id: planId } = (await planResponse.json()) as {
    id: string;
  };

  // Account B must not view Account A's plan.
  const viewResponse = await fetch(`${BASE_URL}/plans/${planId}`, {
    headers: headersB,
  });
  expect(viewResponse.status).toBe(404);

  // Account B must not modify Account A's plan.
  const updateResponse = await fetch(`${BASE_URL}/plans/${planId}`, {
    method: "PUT",
    headers: headersB,
    body: JSON.stringify({ monthlyAllowance: 500 }),
  });
  expect(updateResponse.status).toBe(404);

  // Account B must not assign Account A's plan to a user.
  const assignResponse = await fetch(`${BASE_URL}/users`, {
    method: "POST",
    headers: headersB,
    body: JSON.stringify({
      externalId: "unauthorized-user",
      planId,
    }),
  });
  expect(assignResponse.status).toBe(404);
});
it("returns request history with pagination", async () => {
  // Create a test account.
  const accountResponse = await fetch(`${BASE_URL}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "History Test Account" }),
  });

  expect(accountResponse.status).toBe(201);
  const { apiKey } = (await accountResponse.json()) as {
    apiKey: string;
  };

  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };

  // Create a user.
  const userResponse = await fetch(`${BASE_URL}/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ externalId: "history-user" }),
  });
  expect(userResponse.status).toBe(201);

  // One accepted request and one rejected request.
  for (const request of [
    { requestId: "history-accepted", units: 5 },
    { requestId: "history-rejected", units: 21 },
  ]) {
    const response = await fetch(`${BASE_URL}/consume`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        externalId: "history-user",
        ...request,
      }),
    });

    expect(response.status).toBe(200);
  }

  // Get the first page (one record).
  const firstResponse = await fetch(
    `${BASE_URL}/requests?limit=1&offset=0`,
    { headers },
  );

  expect(firstResponse.status).toBe(200);
  const first = await firstResponse.json();

  expect(first.items).toHaveLength(1);
  expect(first.pagination).toMatchObject({
    hasMore: true,
    nextOffset: 1,
  });

  // Get the second page.
  const secondResponse = await fetch(
    `${BASE_URL}/requests?limit=1&offset=1`,
    { headers },
  );

  expect(secondResponse.status).toBe(200);
  const second = await secondResponse.json();

  expect(second.items).toHaveLength(1);
  expect(second.pagination).toMatchObject({
    hasMore: false,
    nextOffset: null,
  });

  // Verify both decisions were saved.
  const records = [...first.items, ...second.items];

  expect(records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        requestId: "history-accepted",
        accepted: true,
        units: 5,
      }),
      expect.objectContaining({
        requestId: "history-rejected",
        accepted: false,
        rejectedScope: "user",
        rejectedRule: "max_per_request",
      }),
    ]),
  );

  // The rejected request must not increase usage.
  const usageResponse = await fetch(`${BASE_URL}/usage`, {
    headers,
  });

  expect(usageResponse.status).toBe(200);
  expect(await usageResponse.json()).toMatchObject({
    unitsUsed: 5,
  });
});
it("allows querying previous months without changing current usage", async () => {
  const accountResponse = await fetch(`${BASE_URL}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Historical Usage Test" }),
  });

  expect(accountResponse.status).toBe(201);
  const { apiKey } = await accountResponse.json();

  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };

  // Create a user.
  const userResponse = await fetch(`${BASE_URL}/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ externalId: "history-test-user" }),
  });

  expect(userResponse.status).toBe(201);

  // Consume 5 units in the current month.
  const consumeResponse = await fetch(`${BASE_URL}/consume`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      externalId: "history-test-user",
      requestId: "historical-test-001",
      units: 5,
    }),
  });

  expect(consumeResponse.status).toBe(200);

  // Calculate the previous UTC month.
  const now = new Date();
  const previousPeriod = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  ).toISOString().slice(0, 7);

  // Previous month should have zero usage for this new account.
  for (const path of [
    "/usage",
    "/usage/users/history-test-user",
  ]) {
    const response = await fetch(
      `${BASE_URL}${path}?period=${previousPeriod}`,
      { headers },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      period: previousPeriod,
      unitsUsed: 0,
    });
  }

  // Current usage must remain unchanged.
  const currentResponse = await fetch(`${BASE_URL}/usage`, {
    headers,
  });

  expect(currentResponse.status).toBe(200);
  expect(await currentResponse.json()).toMatchObject({
    unitsUsed: 5,
  });
});

it("applies shared plan updates to multiple users", async () => {
  // Create an account.
  const accountResponse = await fetch(`${BASE_URL}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Shared Plan Test" }),
  });

  expect(accountResponse.status).toBe(201);

  const { apiKey } = (await accountResponse.json()) as {
    apiKey: string;
  };

  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };

  // Create one custom user plan.
  const planResponse = await fetch(`${BASE_URL}/plans`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Shared User Plan",
      kind: "user",
      monthlyAllowance: 100,
      maxPerRequest: 20,
    }),
  });

  expect(planResponse.status).toBe(201);
  const { id: planId } = (await planResponse.json()) as {
    id: string;
  };

  // Both users share the same plan.
  for (const externalId of ["alice", "bob"]) {
    const userResponse = await fetch(`${BASE_URL}/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ externalId, planId }),
    });

    expect(userResponse.status).toBe(201);

    const response = await fetch(`${BASE_URL}/consume`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        externalId,
        requestId: `${externalId}-before-update`,
        units: 15,
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      accepted: true,
    });
  }

  // Change the shared plan's per-request limit.
  const updateResponse = await fetch(
    `${BASE_URL}/plans/${planId}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ maxPerRequest: 10 }),
    },
  );

  expect(updateResponse.status).toBe(200);

  // Both users must now follow the updated limit.
  for (const externalId of ["alice", "bob"]) {
    const response = await fetch(`${BASE_URL}/consume`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        externalId,
        requestId: `${externalId}-after-update`,
        units: 12,
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      accepted: false,
      rejectedScope: "user",
      rejectedRule: "max_per_request",
    });

    // Earlier accepted usage must be preserved.
    const usageResponse = await fetch(
      `${BASE_URL}/usage/users/${externalId}`,
      { headers },
    );

    expect(usageResponse.status).toBe(200);
    expect(await usageResponse.json()).toMatchObject({
      maxPerRequest: 10,
      unitsUsed: 15,
    });
  }

  // Both accepted actions count toward account usage.
  const accountUsageResponse = await fetch(
    `${BASE_URL}/usage`,
    { headers },
  );

  expect(accountUsageResponse.status).toBe(200);
  expect(await accountUsageResponse.json()).toMatchObject({
    unitsUsed: 30,
  });
});

it("rejects invalid consumption inputs", async () => {
  const accountResponse = await fetch(`${BASE_URL}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Validation Test Account" }),
  });

  expect(accountResponse.status).toBe(201);

  const { apiKey } = (await accountResponse.json()) as {
    apiKey: string;
  };

  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };

  const invalidRequests = [
    { externalId: "user-1", requestId: "zero", units: 0 },
    { externalId: "user-1", requestId: "negative", units: -5 },
    { externalId: "user-1", requestId: "decimal", units: 2.5 },
    { externalId: "user-1", requestId: "string", units: "10" },
    { externalId: "user-1", units: 5 },
    { requestId: "missing-user", units: 5 },
  ];

  for (const body of invalidRequests) {
    const response = await fetch(`${BASE_URL}/consume`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
  }

  // Invalid requests should not be saved in history.
  const historyResponse = await fetch(`${BASE_URL}/requests`, {
    headers,
  });

  expect(historyResponse.status).toBe(200);

  const history = await historyResponse.json();
  expect(history.items).toHaveLength(0);
});

});
