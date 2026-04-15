# Rate Limiting

## Why it exists

HubSpot enforces API rate limits (~19 requests/second for the private apps tier). Since multiple webhooks can fire concurrently, a single shared rate limiter prevents 429 (Too Many Requests) errors from overwhelming the application.

## How it works

The rate limiter lives in `app/service/rate_limiter.py` and consists of three components:

### 1. Dual Token-Bucket Limiters

Two `aiolimiter.AsyncLimiter` instances enforce rate limits at different time windows:

- **LIMITER_1S**: 8 requests per 1 second (per-instance cap; keeps two Railway nodes safely under HubSpot's ~19/s limit)
- **LIMITER_10S**: 80 requests per 10 seconds (aligned with the lower per-second rate)

Every call must acquire a token from both limiters before executing.

### 2. Async Queue with Workers

All HubSpot calls are enqueued into `API_QUEUE` (an `asyncio.Queue`). Multiple worker coroutines (default: 3, set by `WORKER_COUNT`) consume from the queue. This prevents a single slow call from blocking all other calls.

Each worker:
1. Picks a call from the queue
2. Checks the cooldown map (skip if this call type recently timed out)
3. Acquires tokens from both limiters
4. Adds jitter delay (0--0.3s) to smooth concurrent bursts across nodes
5. Executes the call with a timeout (`CALL_TIMEOUT = 25s`)
6. On success: returns the result
7. On 429: retries with exponential backoff (up to `MAX_RETRIES = 3`)
8. On timeout: puts the call label in cooldown for 60 seconds

### 3. Cooldown Protection

When a specific call type times out, it enters a cooldown period (`TIMEOUT_COOLDOWN = 60s`). During cooldown, new calls of the same type are immediately rejected with a `TimeoutError` to prevent all workers from getting stuck on the same broken call.

## How to use

Service functions call `call_hubspot_api` with a synchronous repository function and its arguments:

```python
from app.service.rate_limiter import call_hubspot_api
import app.repository.hubspot as hubspot_calls

result = await call_hubspot_api(hubspot_calls.get_deal_info, deal_id, properties=["pipeline", "dealstage"])
```

The function wraps the synchronous HubSpot SDK call in `run_in_executor`, enqueues it, and waits for the result with a 30-second timeout.

## Configuration

All rate limiter settings are constants at the top of `app/service/rate_limiter.py`:

| Constant | Default | Purpose |
|---|---|---|
| `RATE_LIMIT_1S` | 8 | Max calls per second per instance |
| `RATE_LIMIT_10S` | 80 | Max calls per 10-second window |
| `BURST_DELAY` | 0 | Base delay between calls (seconds) |
| `MAX_RETRIES` | 3 | Max 429 retries before giving up |
| `RETRY_BACKOFF_BASE` | 2 | Exponential backoff base (2^retry seconds) |
| `CALL_TIMEOUT` | 25 | Max seconds a single call may take |
| `WORKER_COUNT` | 3 | Number of concurrent queue workers |
| `TIMEOUT_COOLDOWN` | 60 | Seconds to reject a call type after timeout |
| `JITTER_MAX` | 0.3 | Max random jitter added to each call |
