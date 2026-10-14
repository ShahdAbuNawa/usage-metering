
# Performance Test Results

## Test Environment

- Application: Usage Metering Service
- Backend: TypeScript, Express, PostgreSQL
- Execution: Docker Compose on Docker Desktop / WSL 2
- Test script: `scripts/load-test.mjs`
- Workload: 200 consumption requests per run
- Each request: 1 unit
- All requests belong to one newly created account and user

## Results

| Workers | Throughput (req/s) | p50 (ms) | p95 (ms) | Successful | Failed |
|---|---:|---:|---:|---:|---:|
| 10 (run 1) | 41.26 | 148.53 | 861.38 | 200 | 0 |
| 1 | 50.56 | 16.42 | 29.36 | 200 | 0 |
| 20 | 49.16 | 261.97 | 1279.16 | 200 | 0 |
| 10 (run 2) | 57.97 | 159.63 | 276.02 | 200 | 0 |

## How to Reproduce

Start the application:

```sh
docker compose up --build
```

In another terminal, run:

```sh
LOAD_CONCURRENCY=1 node scripts/load-test.mjs
LOAD_CONCURRENCY=10 node scripts/load-test.mjs
LOAD_CONCURRENCY=20 node scripts/load-test.mjs
```

The default workload is 200 requests.

## Findings

1. All four runs completed successfully.
2. Account and user counters both ended at 200 units in every run.
3. Increasing concurrency did not consistently increase throughput.
4. Request latency generally increased at higher concurrency levels.
5. Account-level PostgreSQL locking may contribute to waiting under concurrent load.
6. The repeated 10-worker run showed considerable performance variation.

## Limitations

- Tests ran on one development laptop.
- Most concurrency settings were tested only once.
- All requests targeted the same account and user.
- No separate-account scalability benchmark was performed.
- Results are preliminary and should not be treated as maximum service capacity.
```
