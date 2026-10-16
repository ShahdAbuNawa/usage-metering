# Usage Metering and Quota Service

A backend service built with TypeScript, Express, PostgreSQL, and Drizzle ORM that tracks usage and enforces account-level and user-level quotas.

Developed as the final project for the Foothill Technology Solutions internship.

## 1. Overview

This service allows applications to track how many units their users consume and decide whether an action should be accepted or rejected.

Each application is represented by an **account**, and each account can have multiple **users**.

Both accounts and users have plans that define:

- **Monthly allowance:** Maximum units allowed per UTC calendar month.
- **Maximum per request:** Maximum units allowed in one action.

A consumption request succeeds only if both the account and user plans allow it.

Accepted requests increase both usage counters. Rejected requests consume no units.

## 2. Technology Stack

| Technology | Purpose |
|---|---|
| TypeScript | Application logic and type safety |
| Node.js and Express | REST API |
| PostgreSQL | Persistent storage |
| Drizzle ORM | Database queries, transactions, and migrations |
| Vitest | Unit and integration testing |
| Docker Compose | Full-stack local deployment |

## 3. Quick Start with Docker

**Prerequisite:** Docker Desktop or Docker Engine with Docker Compose.

From the project directory, run:

`docker compose up --build`

This starts:

1. PostgreSQL, with automatic database initialization.
2. The metering API, including predefined plan setup.
3. An example command-line client that demonstrates quota enforcement.

The API is accessible from the host at:

`http://localhost:8082`

To verify that it is running:

`curl http://localhost:8082/healthz`

Expected response:

`{"status":"ok"}`

The example client runs automatically and prints consumption decisions and remaining allowances. It exits after completing the demonstration, while the API and database remain available.

To stop the services, press Ctrl+C.

PostgreSQL data is stored in a named Docker volume. Restarting the
containers preserves accounts, plans, and usage records. Avoid
`docker compose down -v` unless you intend to delete the stored data.

**Security note:** The Docker Compose configuration uses a demonstration database password by default. It is intended for local development only.

## 4. Predefined Plans

| Plan | Type | Monthly allowance | Max per request |
|---|---|---:|---:|
| Starter | Account | 10,000 | 100 |
| Pro | Account | 100,000 | 1,000 |
| Basic | User | 1,000 | 20 |
| Premium | User | 10,000 | 200 |

Accounts can also create and modify their own custom plans. Shared predefined plans are read-only.

## 5. Authentication

Account-specific API endpoints require an API key sent in the `X-API-Key` request header.

An account is created using `POST /accounts`. The API returns a newly generated key during account creation.

API keys are stored as hashes in PostgreSQL, rather than as plaintext.

Requests with missing or invalid API keys return HTTP 401.

Each authenticated account can access only its own users, usage records, and custom plans.

## Example API Requests

The examples below use the Dockerized API at `http://localhost:8082`.

### 1. Create an account

```bash
curl -X POST http://localhost:8082/accounts \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo Company"}'
```

The response includes an account ID and a newly generated API key.

### 2. Set your API key

In your terminal, run:

```bash
read -rsp "Enter your API key: " API_KEY
echo
```

Paste the API key returned during account creation and press Enter.

Do not commit API keys to Git or share them publicly.

### 3. Register a user

```bash
curl -X POST http://localhost:8082/users \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"externalId":"alice"}'
```

This creates Alice under your account with the default Basic plan.

### 4. Consume units

```bash
curl -X POST http://localhost:8082/consume \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "externalId":"alice",
    "requestId":"demo-request-001",
    "units":10
  }'
```

If both account and user quotas allow it, the response contains `"accepted":true`.

Use a new request ID for each new action. Reuse the same ID only when retrying the original action.

### 5. Check usage

```bash
curl http://localhost:8082/usage \
  -H "X-API-Key: $API_KEY"
```

For a newly created account that has accepted only the 10-unit request above, the result includes:

- `unitsUsed`: 10
- `unitsRemaining`: 9990

### 6. View request history

```bash
curl "http://localhost:8082/requests?limit=10&offset=0" \
  -H "X-API-Key: $API_KEY"
```

This retrieves up to 10 consumption records for the authenticated account.

## 6. API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/accounts` | Create an account and issue an API key |
| GET | `/me` | View the authenticated account |
| PUT | `/me/plan` | Switch the account's plan |
| POST | `/users` | Register a user |
| GET | `/users/:externalId` | Retrieve a user |
| PUT | `/users/:externalId/plan` | Change a user's plan |
| POST | `/plans` | Create a custom plan |
| GET | `/plans` | List available plans |
| GET | `/plans/:planId` | View a plan |
| PUT | `/plans/:planId` | Update a custom plan |
| POST | `/consume` | Request usage consumption |
| GET | `/usage` | View account usage |
| GET | `/usage/users/:externalId` | View individual user usage |
| GET | `/requests` | View paginated request history |
| GET | `/healthz` | Check API/database health |

Both usage endpoints support an optional `period=YYYY-MM` query parameter.

Request history supports `limit`, `offset`, and an optional `externalId` filter.

## 7. Consumption and Reliability

Each consumption request supplies:

- `externalId`: The user performing the action.
- `requestId`: A unique request identifier within the account.
- `units`: A positive whole number of units to consume.

The service checks four rules: account maximum per request, user maximum per request, account monthly allowance, and user monthly allowance.

Valid consumption requests return HTTP 200 with a decision indicating whether the request was accepted. Rejections identify the responsible rule and scope.

### Safe retries

Requests are idempotent using the combination of account ID and request ID.

Repeating an identical request returns the stored decision without charging again.

Reusing the same request ID with different request details returns HTTP 409 Conflict.

### Concurrent requests

Consumption uses PostgreSQL transactions and row-level locking to avoid exceeding shared quotas during concurrent requests.

Account-level locking prioritizes correctness but can limit throughput when many requests target the same account.

## 8. Plan Changes and Monthly Usage

Changes to plans apply to subsequent consumption decisions without restarting the service.

Changing or switching a plan does not reset usage already recorded for the current month.

If existing usage exceeds the new monthly allowance, the service displays zero remaining units and rejects further consumption at that level.

Usage is grouped by UTC calendar month. Previous months' usage and request outcomes remain available for querying.

Historical usage reports show stored usage for the selected period alongside currently assigned plan limits.

## 9. Example Client

The TypeScript command-line example is located at `src/example/client.ts`.

It demonstrates two users assigned to different plans:

- A Basic user and a Premium user successfully consume units.
- The Basic user receives a rejection for exceeding the user per-request limit.
- A Premium user's request is rejected when the shared account allowance is insufficient.
- The account's custom plan is updated, allowing a new consumption request to succeed without changing the client's consumption logic.

The client prints account and user usage after the actions.

## 10. Automated Tests

The project uses Vitest and currently includes:

- Five unit tests for quota rules.
- Eleven integration tests covering consumption, retries, rejections, authentication, account isolation, custom plan permissions, plan changes, concurrency, request history and pagination, historical usage queries, shared plan updates, and input validation.

### Run automated tests with Docker (recommended)

Run:

docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from tests

This automatically starts:
- A temporary PostgreSQL test database
- The test API
- All 16 automated tests

No manual database or test server setup is required.

After testing, clean up with:

docker compose -f compose.test.yaml down

### Run tests locally

npm test

Local integration tests require a running test API connected
to a separate test database. By default, the API address
is http://localhost:8081.

You can override it using the METERING_BASE_URL environment variable.

## 11. Performance Testing

The project includes a reproducible benchmark script at `scripts/load-test.mjs`.

Example command, with the Dockerized API running:

`LOAD_CONCURRENCY=10 node scripts/load-test.mjs`

The benchmark measures request throughput, p50 latency, and p95 latency, and verifies account and user usage totals.

Initial tests used 200 consumption requests per run at 1, 10, and 20 concurrent workers.

All tested runs completed with correct usage totals. Throughput and latency varied, and account-level locking is a possible contributor to contention.

See `docs/performance-results.md` for measured results, reproduction instructions, findings, and limitations.

## 12. Design Decisions and Limitations

- One metered resource is supported: usage units.
- Account and user limits must both pass for a request to be accepted.
- Rejected requests are saved in history but do not increase usage.
- Consumption is processed transactionally in PostgreSQL.
- Request history uses simple offset-based pagination.
- New calendar months start with zero usage without deleting previous records.
- Existing usage is preserved when plans change.
- API key rotation, rate limiting, and production infrastructure are not implemented.
- Running integration tests locally without Docker requires a separate test API and database. The Docker test setup is fully automated.
- The supplied Docker configuration is intended for local demonstration.

The project focuses on correctness, reliable quota enforcement, and clear technical decisions rather than billing, payments, or distributed infrastructure.
