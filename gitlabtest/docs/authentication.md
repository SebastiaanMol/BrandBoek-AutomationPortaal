# Authentication

## How it works

The application uses API key authentication via the `X-API-Key` HTTP header. The implementation lives in `app/auth.py`.

### Mechanism

1. The `BRAND_API_KEY` environment variable holds the expected API key.
2. A FastAPI `APIKeyHeader` security scheme extracts the `X-API-Key` header from incoming requests.
3. The `get_api_key` dependency compares the header value against the environment variable.
4. If the key matches, the request proceeds. Otherwise, a 401 Unauthorized response is returned.

### How routers use it

Most routers apply authentication at the router level using `dependencies=[Security(get_api_key)]`:

```python
router = APIRouter(
    prefix="/operations",
    dependencies=[Security(get_api_key)],
)
```

This means every endpoint under that router requires the API key. A few endpoints use alternative auth:

- **Offerte.nl** (`/sales/leads/hubspot/offerte.nl`): Uses HTTP Basic Auth with the API key as the password.
- **Solvari** (`/sales/leads/hubspot/solvari`): Checks a `secret` field in the request body against the `SOLVARI_KEY` environment variable.

### Making authenticated requests

```bash
curl -X POST https://your-domain/operations/hubspot/create_new_deal \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"deal_id": "123456"}'
```

## Configuration

| Variable | Purpose |
|---|---|
| `BRAND_API_KEY` | The API key that all `X-API-Key` authenticated endpoints validate against |
| `SOLVARI_KEY` | Separate secret for Solvari webhook authentication |
