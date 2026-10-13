
import { describe, expect, it } from "vitest";

const BASE_URL = "http://localhost:8080";

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

});
