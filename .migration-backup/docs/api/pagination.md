# Pagination & filtering

## Cursor-based pagination

Most list endpoints use cursor-based pagination. This is more efficient than offset-based pagination for large datasets and prevents the "skipped rows" problem when records are added during iteration.

### Request

```http
GET /api/v1/orders?limit=50&cursor=ord_01jz...
```

| Parameter | Default | Description |
|---|---|---|
| `limit` | 20 | Records per page (max 200) |
| `cursor` | none | Opaque cursor from previous response |

### Response shape

```json
{
  "items": [ ... ],
  "nextCursor": "ord_01jz...",
  "total": 1247
}
```

- `items` — the records for this page
- `nextCursor` — pass as `cursor` in the next request; `null` when on the last page
- `total` — total matching records (useful for "showing X of Y" UI)

### Iterating all records

```javascript
let cursor = undefined;
const allOrders = [];

do {
  const response = await api.get("/api/v1/orders", { params: { limit: 100, cursor } });
  allOrders.push(...response.items);
  cursor = response.nextCursor;
} while (cursor);
```

## Offset-based pagination (legacy)

Some older endpoints use `limit` + `offset`:
```http
GET /api/v1/notifications?limit=20&offset=40
```

These will be migrated to cursor-based pagination in a future release.

## Filtering

Filters are passed as query parameters:

```http
GET /api/v1/orders?status=completed&limit=50
GET /api/v1/inventory?lowStock=true
GET /api/v1/customers?q=john
GET /api/v1/reports/summary?range=7d
```

Common filter parameters across endpoints:

| Parameter | Type | Description |
|---|---|---|
| `q` | string | Full-text search |
| `status` | string | Filter by status enum value |
| `from` | integer | Start of date range (epoch ms) |
| `to` | integer | End of date range (epoch ms) |
| `range` | string | Preset: `today`, `7d`, `30d`, `90d`, `all` |
| `limit` | integer | Max records per page |
| `cursor` | string | Pagination cursor |
| `offset` | integer | Legacy offset for offset-paginated endpoints |

## Sorting

Sorting is not exposed as a query parameter on most endpoints — records are returned in the natural order for each resource (e.g. orders newest-first, inventory alphabetically). Endpoint-specific sort options are documented in the OpenAPI spec.
