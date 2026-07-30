import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePath, recordRequest, renderMetrics, resetMetrics } from "./metrics.js";

test("normalizePath collapses dynamic id segments to :id", () => {
  assert.equal(normalizePath("/api/v1/catalog/prod_019ebbad-f34a-72fb"), "/api/v1/catalog/:id");
  assert.equal(normalizePath("/api/v1/inventory/123/receive"), "/api/v1/inventory/:id/receive");
  assert.equal(normalizePath("/api/v1/orders/ord_abc/refund"), "/api/v1/orders/:id/refund");
  assert.equal(normalizePath("/api/v1/reports/summary?x=1"), "/api/v1/reports/summary");
  assert.equal(normalizePath("/healthz"), "/healthz");
});

test("recordRequest aggregates counts and durations; renderMetrics emits Prometheus text", () => {
  resetMetrics();
  recordRequest("GET", "/api/v1/reports/summary", 200, 12.5);
  recordRequest("GET", "/api/v1/reports/summary", 200, 7.5);
  recordRequest("POST", "/api/v1/catalog/prod_x", 201, 30);
  recordRequest("POST", "/api/v1/catalog/prod_y", 400, 5);

  const out = renderMetrics();
  // counter: two 200s on the summary route collapse to one series with value 2
  assert.match(out, /http_requests_total\{method="GET",path="\/api\/v1\/reports\/summary",status="200"\} 2/);
  // id normalization collapses prod_x / prod_y to :id
  assert.match(out, /http_requests_total\{method="POST",path="\/api\/v1\/catalog\/:id",status="201"\} 1/);
  assert.match(out, /http_requests_total\{method="POST",path="\/api\/v1\/catalog\/:id",status="400"\} 1/);
  // duration summary: sum=20, count=2 for the GET summary route
  assert.match(out, /http_request_duration_ms_sum\{method="GET",path="\/api\/v1\/reports\/summary"\} 20\.000/);
  assert.match(out, /http_request_duration_ms_count\{method="GET",path="\/api\/v1\/reports\/summary"\} 2/);
  assert.match(out, /# TYPE http_requests_total counter/);
  resetMetrics();
});
