"use client";

import React from "react";
import { usePermissions } from "@/contexts/PermissionsContext";

// ── Can ───────────────────────────────────────────────────────────────────────
// Renders children only when user has the given feature permission.

interface CanProps {
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function Can({ permission, fallback = null, children }: CanProps) {
  const { hasFeature } = usePermissions();
  return hasFeature(permission) ? <>{children}</> : <>{fallback}</>;
}

// ── CanAny ────────────────────────────────────────────────────────────────────
// Renders children if user has ANY of the listed permissions.

interface CanAnyProps {
  permissions: string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function CanAny({ permissions, fallback = null, children }: CanAnyProps) {
  const { hasFeature } = usePermissions();
  const ok = permissions.some((p) => hasFeature(p));
  return ok ? <>{children}</> : <>{fallback}</>;
}

// ── CanAll ────────────────────────────────────────────────────────────────────
// Renders children only if user has ALL of the listed permissions.

interface CanAllProps {
  permissions: string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function CanAll({ permissions, fallback = null, children }: CanAllProps) {
  const { hasFeature } = usePermissions();
  const ok = permissions.every((p) => hasFeature(p));
  return ok ? <>{children}</> : <>{fallback}</>;
}

// ── RoleGuard ────────────────────────────────────────────────────────────────
// Renders children only when user's role matches (or is in) the allowed list.

interface RoleGuardProps {
  roles: string | string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function RoleGuard({ roles, fallback = null, children }: RoleGuardProps) {
  const { role } = usePermissions();
  const allowed = Array.isArray(roles) ? roles : [roles];
  return allowed.includes(role) ? <>{children}</> : <>{fallback}</>;
}

// ── PermissionGuard ───────────────────────────────────────────────────────────
// Full-page / section guard. Shows an "Access denied" UI when the user lacks
// the required permission. Use at route level to protect whole pages.

interface PermissionGuardProps {
  permission: string;
  children: React.ReactNode;
  /** Override the access-denied message */
  message?: string;
}

export function PermissionGuard({ permission, children, message }: PermissionGuardProps) {
  const { hasFeature, loading } = usePermissions();

  if (loading) return null;

  if (!hasFeature(permission)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
          <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <h2 className="mt-4 text-base font-semibold text-slate-900">Access restricted</h2>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          {message ?? "You don't have permission to view this page. Contact your administrator to request access."}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

// ── ReadOnlyWrapper ───────────────────────────────────────────────────────────
// Disables all interactive children when `readOnly` is true (or when user
// lacks the required write permission).

interface ReadOnlyWrapperProps {
  readOnly?: boolean;
  permission?: string;
  children: React.ReactNode;
  className?: string;
}

export function ReadOnlyWrapper({
  readOnly,
  permission,
  children,
  className,
}: ReadOnlyWrapperProps) {
  const { hasFeature } = usePermissions();

  const isReadOnly = readOnly ?? (permission ? !hasFeature(permission) : false);

  if (!isReadOnly) return <>{children}</>;

  return (
    <div className={`pointer-events-none select-none opacity-60 ${className ?? ""}`} aria-disabled="true">
      {children}
    </div>
  );
}

// ── ActionVisibilityGuard ────────────────────────────────────────────────────
// Hides action buttons / menus when user lacks the required permission.
// Lighter than PermissionGuard — doesn't render an error page, just hides.

interface ActionVisibilityGuardProps {
  permission: string;
  children: React.ReactNode;
}

export function ActionVisibilityGuard({ permission, children }: ActionVisibilityGuardProps) {
  const { hasFeature } = usePermissions();
  return hasFeature(permission) ? <>{children}</> : null;
}

// ── OutletAccessGuard ────────────────────────────────────────────────────────
// Placeholder for outlet-level access control. Currently passes through;
// will enforce outlet restrictions once outlet context is implemented.

interface OutletAccessGuardProps {
  outletId?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function OutletAccessGuard({ children }: OutletAccessGuardProps) {
  return <>{children}</>;
}
