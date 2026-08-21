/**
 * Quiet-hours window logic tests.
 *
 * Verifies HH:MM parsing, IANA timezone validation, and the pure
 * quiet-window check (same-day and overnight windows, boundary
 * semantics, timezone-aware evaluation, fail-open on bad config).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isWithinQuietWindow,
  parseHHMM,
  isValidTimezone,
  type QuietHoursConfig,
} from "./service.js";

function cfg(partial: Partial<QuietHoursConfig> = {}): QuietHoursConfig {
  return {
    enabled: true,
    start: "22:00",
    end: "07:00",
    timezone: "UTC",
    ...partial,
  };
}

// Fixed instants
const AT_0230_UTC = new Date("2026-08-02T02:30:00Z");
const AT_NOON_UTC = new Date("2026-08-02T12:00:00Z");

test("parseHHMM parses valid times", () => {
  assert.equal(parseHHMM("00:00"), 0);
  assert.equal(parseHHMM("22:00"), 1320);
  assert.equal(parseHHMM("23:59"), 1439);
});

test("parseHHMM rejects malformed times", () => {
  assert.equal(parseHHMM("24:00"), null);
  assert.equal(parseHHMM("9:00"), null);
  assert.equal(parseHHMM("22:60"), null);
  assert.equal(parseHHMM("bogus"), null);
});

test("isValidTimezone accepts IANA names and rejects garbage", () => {
  assert.equal(isValidTimezone("America/New_York"), true);
  assert.equal(isValidTimezone("UTC"), true);
  assert.equal(isValidTimezone("Not/A_Zone"), false);
});

test("quiet window is inactive when disabled", () => {
  assert.equal(isWithinQuietWindow(cfg({ enabled: false }), AT_0230_UTC), false);
});

test("suppresses inside an overnight window", () => {
  assert.equal(isWithinQuietWindow(cfg(), AT_0230_UTC), true); // 02:30 in 22:00–07:00
  assert.equal(isWithinQuietWindow(cfg(), AT_NOON_UTC), false);
});

test("handles same-day windows", () => {
  const c = cfg({ start: "09:00", end: "17:00" });
  assert.equal(isWithinQuietWindow(c, AT_NOON_UTC), true);
  assert.equal(isWithinQuietWindow(c, AT_0230_UTC), false);
});

test("boundary: start is inclusive, end is exclusive", () => {
  assert.equal(isWithinQuietWindow(cfg({ start: "02:30", end: "03:00" }), AT_0230_UTC), true);
  assert.equal(isWithinQuietWindow(cfg({ start: "02:00", end: "02:30" }), AT_0230_UTC), false);
});

test("start === end means no window", () => {
  assert.equal(isWithinQuietWindow(cfg({ start: "02:00", end: "02:00" }), AT_0230_UTC), false);
});

test("evaluates in the tenant's timezone", () => {
  // 02:30 UTC == 22:30 in New York (EDT, UTC-4) — inside 22:00–07:00 local
  const ny = cfg({ timezone: "America/New_York" });
  assert.equal(isWithinQuietWindow(ny, AT_0230_UTC), true);
  // Noon UTC == 08:00 NY — outside
  assert.equal(isWithinQuietWindow(ny, AT_NOON_UTC), false);
  // 02:30 UTC == 11:30 in Tokyo (UTC+9) — outside
  assert.equal(isWithinQuietWindow(cfg({ timezone: "Asia/Tokyo" }), AT_0230_UTC), false);
});

test("fails open on an invalid timezone (never blocks pushes by mistake)", () => {
  assert.equal(isWithinQuietWindow(cfg({ timezone: "Not/A_Zone" }), AT_0230_UTC), false);
});
