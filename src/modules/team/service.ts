import { v7 as uuidv7 } from "uuid";
import { randomBytes } from "node:crypto";
import type { DB } from "../../shared/db.js";
import { HttpError } from "../../shared/http.js";

/** Team directory — tenant-scoped view over the shared users table.
 *  Powers the Settings → Users surface. Never returns password hashes. */

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  custom_role_id: string | null;
  created_at: number;
}

export interface CreateTeamMemberInput {
  name: string;
  email: string;
  role?: string;
}

const MEMBER_COLUMNS = "id, COALESCE(name, '') AS name, email, role, custom_role_id, created_at";

export class TeamService {
  constructor(private readonly db: DB) {}

  async list(tenantId: string): Promise<TeamMember[]> {
    return this.db.query<TeamMember>(
      `SELECT ${MEMBER_COLUMNS} FROM users WHERE tenant_id = @tenantId ORDER BY created_at ASC`,
      { tenantId },
    );
  }

  async get(id: string, tenantId: string): Promise<TeamMember> {
    const row = await this.db.one<TeamMember>(
      `SELECT ${MEMBER_COLUMNS} FROM users WHERE id = @id AND tenant_id = @tenantId`,
      { id, tenantId },
    );
    if (!row) throw new HttpError(404, "not_found", `team member '${id}' not found`);
    return row;
  }

  /** Invite a new member: creates a users row with an unguessable placeholder
   *  password — the member must complete a password reset before first login. */
  async create(input: CreateTeamMemberInput, tenantId: string): Promise<TeamMember> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.db.one<{ id: string }>(
      "SELECT id FROM users WHERE tenant_id = @tenantId AND email = @email",
      { tenantId, email },
    );
    if (existing) throw new HttpError(409, "conflict", "Email already exists.");

    const { default: bcrypt } = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
    const now = Date.now();
    const id = `usr_${uuidv7()}`;
    await this.db.query(
      `INSERT INTO users (id, tenant_id, email, name, password_hash, role, created_at, updated_at)
       VALUES (@id, @tenantId, @email, @name, @hash, @role, @now, @now)`,
      { id, tenantId, email, name: input.name.trim(), hash: passwordHash, role: input.role ?? "cashier", now },
    );
    return this.get(id, tenantId);
  }
}
