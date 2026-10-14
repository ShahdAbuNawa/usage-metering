
import { performance } from "node:perf_hooks";

const BASE_URL =
  process.env.METERING_BASE_URL ?? "http://localhost:8082";

const TOTAL = Number(process.env.LOAD_TOTAL ?? 200);
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 10);

if (
  !Number.isSafeInteger(TOTAL) ||
  TOTAL < 1 ||
  TOTAL > 1000 ||
  !Number.isSafeInteger(CONCURRENCY) ||
  CONCURRENCY < 1 ||
  CONCURRENCY > 50
) {
  throw new Error("Invalid load-test settings");
}

// Helper to communicate with our API.
async function api(path, method = "GET", apiKey, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(apiKey ? { "X-API-Key": apiKey } : {}),
      ...(body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`);
  }

  return response.json();
}

// Create a fresh account so earlier tests don't affect results.
const account = await api("/accounts", "POST", undefined, {
  name: "Performance Test Account",
});

await api("/users", "POST", account.apiKey, {
  externalId: "load-user",
});

// Each request consumes one unit.
// Basic allows 1000 per month, so TOTAL must be <= 1000.
let nextRequest = 0;
const latencies = [];
const failures = [];

async function worker() {
  while (true) {
    const index = nextRequest++;

    if (index >= TOTAL) return;

    const started = performance.now();

    try {
      const decision = await api(
        "/consume",
        "POST",
        account.apiKey,
        {
          externalId: "load-user",
          requestId: `load-${index}`,
          units: 1,
        },
      );

      if (!decision.accepted) {
        failures.push({ index, decision });
      }
    } catch (error) {
      failures.push({ index, error: String(error) });
    } finally {
      latencies.push(performance.now() - started);
    }
  }
}

console.log("=== Usage Metering Load Test ===");
console.log(`Requests: ${TOTAL}`);
console.log(`Concurrent workers: ${CONCURRENCY}`);

const started = performance.now();

await Promise.all(
  Array.from({ length: CONCURRENCY }, () => worker()),
);

const elapsed = (performance.now() - started) / 1000;

// Sort request latencies to calculate percentiles.
latencies.sort((a, b) => a - b);

function percentile(p) {
  const index = Math.ceil((p / 100) * latencies.length) - 1;
  return latencies[Math.max(0, index)].toFixed(2);
}

// Verify both usage counters after the load test.
const accountUsage = await api("/usage", "GET", account.apiKey);
const userUsage = await api(
  "/usage/users/load-user",
  "GET",
  account.apiKey,
);

console.log("\n=== Results ===");
console.log(`Successful requests: ${TOTAL - failures.length}`);
console.log(`Failed/rejected requests: ${failures.length}`);
console.log(`Elapsed time: ${elapsed.toFixed(2)} seconds`);
console.log(`Throughput: ${(TOTAL / elapsed).toFixed(2)} requests/sec`);
console.log(`Median latency (p50): ${percentile(50)} ms`);
console.log(`95th percentile (p95): ${percentile(95)} ms`);
console.log(`Account units used: ${accountUsage.unitsUsed}`);
console.log(`User units used: ${userUsage.unitsUsed}`);

if (
  failures.length > 0 ||
  accountUsage.unitsUsed !== TOTAL ||
  userUsage.unitsUsed !== TOTAL
) {
  console.error("Sample failures:", failures.slice(0, 3));
  throw new Error("Load test failed correctness checks");
}

console.log("\nPASS: All usage totals are correct.");
