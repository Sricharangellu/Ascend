/**
 * Unit tests for auth/session helpers.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  setSession,
  clearSession,
  getAccessToken,
  getUser,
  isAuthenticated,
  hasRole,
  setRefreshedToken,
} from "@/lib/auth";
import type { UserProfile } from "@/api-client/types";

const MOCK_USER: UserProfile = {
  id: "usr_001",
  email: "owner@test.com",
  name: "Test Owner",
  role: "owner",
  tenantId: "ten_001",
};

beforeEach(() => {
  clearSession();
});

describe("setSession / isAuthenticated", () => {
  it("is not authenticated before login", () => {
    expect(isAuthenticated()).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it("is authenticated after setSession", () => {
    setSession("token-abc", 900, "refresh-abc", MOCK_USER);
    expect(isAuthenticated()).toBe(true);
    expect(getAccessToken()).toBe("token-abc");
    expect(getUser()).toEqual(MOCK_USER);
  });

  it("is not authenticated after clearSession", () => {
    setSession("token-abc", 900, "refresh-abc", MOCK_USER);
    clearSession();
    expect(isAuthenticated()).toBe(false);
    expect(getUser()).toBeNull();
  });

  it("detects expired token", () => {
    // expiresIn = -1 means already expired
    setSession("expired-token", -1, "refresh-abc", MOCK_USER);
    expect(isAuthenticated()).toBe(false);
  });
});

describe("hasRole", () => {
  it("owner passes all role checks", () => {
    setSession("tok", 900, "ref", { ...MOCK_USER, role: "owner" });
    expect(hasRole("owner")).toBe(true);
    expect(hasRole("manager")).toBe(true);
    expect(hasRole("cashier")).toBe(true);
  });

  it("manager passes manager+cashier but not owner", () => {
    setSession("tok", 900, "ref", { ...MOCK_USER, role: "manager" });
    expect(hasRole("owner")).toBe(false);
    expect(hasRole("manager")).toBe(true);
    expect(hasRole("cashier")).toBe(true);
  });

  it("cashier only passes cashier", () => {
    setSession("tok", 900, "ref", { ...MOCK_USER, role: "cashier" });
    expect(hasRole("owner")).toBe(false);
    expect(hasRole("manager")).toBe(false);
    expect(hasRole("cashier")).toBe(true);
  });

  it("returns false when no user", () => {
    expect(hasRole("cashier")).toBe(false);
  });
});

describe("setRefreshedToken", () => {
  it("updates access token without clearing user", () => {
    setSession("old-token", 900, "ref", MOCK_USER);
    setRefreshedToken("new-token", 900);
    expect(getAccessToken()).toBe("new-token");
    expect(getUser()).toEqual(MOCK_USER);
  });
});
