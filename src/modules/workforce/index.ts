import type { PosModule } from "../types.js";
import type { DB } from "../../shared/db.js";
import type { EventBus } from "../../shared/events.js";
import type { Router } from "express";
import { workforceService } from "./service.js";
import { registerRoutes } from "./routes.js";

const CREATE_EMPLOYEES = `
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier',
  email TEXT NOT NULL DEFAULT '',
  avatar_color TEXT NOT NULL DEFAULT '#64748b',
  active INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS employees_tenant_idx ON employees (tenant_id, active);
CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_email_idx
  ON employees (tenant_id, email) WHERE email != '';
`;

const CREATE_SHIFTS = `
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  notes TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS shifts_tenant_date_idx ON shifts (tenant_id, date);
CREATE INDEX IF NOT EXISTS shifts_tenant_employee_idx ON shifts (tenant_id, employee_id, date);
`;

const CREATE_TIME_OFF = `
CREATE TABLE IF NOT EXISTS time_off_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS time_off_tenant_idx ON time_off_requests (tenant_id, status);
`;

export const workforceModule: PosModule = {
  name: "workforce",
  migrations: [CREATE_EMPLOYEES, CREATE_SHIFTS, CREATE_TIME_OFF],
  register({ db, events, router }: { db: DB; events: EventBus; router: Router }) {
    const svc = workforceService(db, events);
    registerRoutes(router, svc);
  },
};
