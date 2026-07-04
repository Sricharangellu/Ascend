import { v7 as uuidv7 } from "uuid";
import type { DB } from "../../shared/db.js";
import { notFound } from "../../shared/http.js";
import {
  BUSINESS_BUNDLES,
  CORE_MODULES,
  GROUP_LABELS,
  MODULE_REGISTRY,
  moduleFlag,
} from "../../shared/moduleRegistry.js";

/**
 * Settings module (ERP benchmark #13): shipping methods, payment terms, payment
 * modes, tax rates, plus a key/value store for the business profile and feature
 * flags. Tenant-scoped. Mutations are role-gated at the route layer.
 */

export interface ShippingMethod {
  id: string; tenant_id: string; name: string; amount_cents: number; free_limit_cents: number | null;
  ecommerce: number; sequence: number; credit_account_id: string | null; debit_account_id: string | null; active: number;
}
export interface PaymentTerm { id: string; tenant_id: string; name: string; days_due: number; description: string | null; active: number; }
export interface PaymentMode { id: string; tenant_id: string; name: string; active: number; }
export interface TaxRate { id: string; tenant_id: string; name: string; rate_bps: number; apply_to_category: string | null; state: string | null; active: number; }

export interface CapabilitiesAuth {
  tenantId: string;
  userId: string;
  role: string;
  storeIds: string[];
  customRoleId?: string;
  permissions: string[];
  scopes: string[];
}

type BusinessCapabilityProfile = {
  requiredFields: Record<string, string[]>;
  workflows: string[];
};

const DEFAULT_FLAGS: Record<string, boolean> = {
  quotations: true, achBatchPayout: false, imeiTracking: false, msaReporting: false,
  compositeProducts: false, customerPortal: false, ecommerce: true, commissionTracking: false,
  pickerFulfillment: true, batchDeposits: true,
  groupRetailPOS: true, groupWholesale: true, groupEnterprise: true,
};

const COMMON_PROFILE: BusinessCapabilityProfile = {
  requiredFields: {
    business: ["businessName", "taxProfile", "defaultOutlet", "defaultRegister"],
    product: ["name", "sku", "retailPriceCents", "taxCategory", "inventoryTracking"],
    customer: ["name", "phoneOrEmail"],
    transaction: ["outletId", "operatorId", "lineItems", "paymentTender"],
  },
  workflows: ["setup_business_profile", "create_product", "receive_inventory", "sell_or_invoice", "settle_payment", "report_day_end"],
};

const BUSINESS_CAPABILITY_PROFILES: Record<string, BusinessCapabilityProfile> = {
  retail: {
    requiredFields: {
      business: ["businessName", "taxProfile", "defaultOutlet", "defaultRegister", "receiptTemplate"],
      product: ["name", "sku", "retailPriceCents", "barcode", "taxCategory", "inventoryTracking"],
      customer: ["name", "phoneOrEmail"],
      transaction: ["outletId", "registerId", "cashierId", "lineItems", "paymentTender"],
    },
    workflows: ["retail_setup", "create_product", "receive_inventory", "open_register", "pos_sale", "refund_or_return", "close_register", "end_of_day_report"],
  },
  wholesale: {
    requiredFields: {
      business: ["legalName", "billingAddress", "taxProfile", "paymentTerms"],
      product: ["name", "sku", "costCents", "priceTiers", "inventoryTracking"],
      customer: ["legalBusinessName", "primaryContact", "billingAddress", "shippingAddresses", "taxIdOrResaleCertificate", "paymentTerms"],
      transaction: ["customerAccountId", "quoteOrOrderLines", "fulfillmentLocation", "invoiceTerms"],
    },
    workflows: ["wholesale_setup", "create_business_customer", "create_quote", "convert_quote_to_sales_order", "receive_inventory", "invoice_customer", "record_payment"],
  },
  restaurant: {
    requiredFields: {
      business: ["businessName", "taxProfile", "serviceAreas", "menuTaxes"],
      product: ["menuItemName", "menuPriceCents", "modifierGroups", "kitchenRoute"],
      customer: ["guestNameOrWalkIn", "phoneForReservation"],
      transaction: ["serviceArea", "serverId", "menuLines", "paymentTender"],
    },
    workflows: ["restaurant_setup", "create_menu_item", "open_table_or_tab", "send_to_kitchen", "take_payment", "close_shift"],
  },
  hybrid: {
    requiredFields: {
      business: ["businessName", "businessSegments", "taxProfile", "defaultOutlet", "defaultRegister"],
      product: ["name", "sku", "retailPriceCents", "costCents", "priceTiers", "inventoryTracking"],
      customer: ["name", "phoneOrEmail", "businessAccountFieldsWhenB2B"],
      transaction: ["outletId", "operatorId", "lineItems", "paymentTender", "invoiceTermsWhenB2B"],
    },
    workflows: ["hybrid_setup", "create_product", "receive_inventory", "pos_sale", "create_quote_or_invoice", "settle_payment", "end_of_day_report"],
  },
  custom: COMMON_PROFILE,
};

const DEFAULT_PLAN_LIMITS = {
  maxUsers: 3,
  maxRegisters: 1,
  maxOutlets: 1,
};

export class SettingsService {
  constructor(private readonly db: DB) {}

  // ── Key/value: business profile + feature flags ──────────────────────────
  private async kvGet<T>(key: string, tenantId: string, fallback: T): Promise<T> {
    const row = await this.db.one<{ value_json: string }>("SELECT value_json FROM settings_kv WHERE tenant_id = @t AND key = @k", { t: tenantId, k: key });
    return row ? (JSON.parse(row.value_json) as T) : fallback;
  }
  private async kvSet(key: string, value: unknown, tenantId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO settings_kv (tenant_id, key, value_json, updated_at) VALUES (@t,@k,@v,@now)
       ON CONFLICT (tenant_id, key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at`,
      { t: tenantId, k: key, v: JSON.stringify(value), now: Date.now() },
    );
  }

  getBusiness(tenantId: string) { return this.kvGet("business", tenantId, {} as Record<string, unknown>); }
  async setBusiness(patch: Record<string, unknown>, tenantId: string) {
    const cur = await this.getBusiness(tenantId);
    const merged = { ...cur, ...patch };
    await this.kvSet("business", merged, tenantId);
    return merged;
  }
  async getFlags(tenantId: string) {
    const flags = { ...DEFAULT_FLAGS, ...(await this.kvGet("feature_flags", tenantId, {} as Record<string, boolean>)) };
    const accountMode = flags["groupEnterprise"] ? "ENTERPRISE" : flags["groupWholesale"] ? "WHOLESALE" : "RETAIL";
    return { ...flags, accountMode };
  }
  async setFlags(patch: Record<string, boolean>, tenantId: string) {
    const cur = await this.kvGet("feature_flags", tenantId, {} as Record<string, boolean>);
    const merged = { ...cur, ...patch };
    await this.kvSet("feature_flags", merged, tenantId);
    return { ...DEFAULT_FLAGS, ...merged };
  }

  private async getSubscriptionSummary(tenantId: string) {
    try {
      const row = await this.db.one<{
        plan: string;
        status: string;
        max_users: number;
        max_registers: number;
        max_outlets: number;
        trial_ends_at: number | null;
        renews_at: number | null;
      }>(
        `SELECT plan, status, max_users, max_registers, max_outlets, trial_ends_at, renews_at
         FROM subscriptions
         WHERE tenant_id = @tenantId
         LIMIT 1`,
        { tenantId },
      );
      if (!row) {
        return {
          name: "starter",
          status: "active",
          source: "default",
          limits: DEFAULT_PLAN_LIMITS,
        };
      }
      return {
        name: row.plan,
        status: row.status,
        source: "subscription",
        limits: {
          maxUsers: row.max_users,
          maxRegisters: row.max_registers,
          maxOutlets: row.max_outlets,
        },
        trialEndsAt: row.trial_ends_at,
        renewsAt: row.renews_at,
      };
    } catch {
      return {
        name: "starter",
        status: "unknown",
        source: "fallback",
        limits: DEFAULT_PLAN_LIMITS,
      };
    }
  }

  async getCapabilities(auth: CapabilitiesAuth) {
    const tenantId = auth.tenantId;
    const [businessData, flags, plan] = await Promise.all([
      this.getBusiness(tenantId),
      this.getFlags(tenantId) as Promise<Record<string, boolean | string>>,
      this.getSubscriptionSummary(tenantId),
    ]);

    const storedBusinessType = typeof businessData["businessType"] === "string"
      ? businessData["businessType"]
      : undefined;
    const businessType = storedBusinessType && BUSINESS_BUNDLES[storedBusinessType]
      ? storedBusinessType
      : "retail";
    const bundle = BUSINESS_BUNDLES[businessType] ?? BUSINESS_BUNDLES["retail"];
    const defaultModules = new Set(bundle.modules);
    const profile = BUSINESS_CAPABILITY_PROFILES[businessType] ?? COMMON_PROFILE;

    const modules = MODULE_REGISTRY.map((mod) => {
      const flagKey = moduleFlag(mod.key);
      const explicitFlag = flags[flagKey];
      const hasManualOverride = typeof explicitFlag === "boolean";
      const defaultEnabled = Boolean(mod.core) || defaultModules.has(mod.key);
      const enabled = mod.core ? true : (hasManualOverride ? explicitFlag : defaultEnabled);
      const source = mod.core
        ? "core"
        : hasManualOverride
          ? "manual_override"
          : defaultEnabled
            ? "business_pack"
            : "not_in_business_pack";
      return {
        ...mod,
        flagKey,
        enabled,
        defaultEnabled,
        source,
        disabledReason: enabled ? null : (hasManualOverride ? "manual_override_disabled" : "not_in_business_pack"),
      };
    });

    const allAccess = auth.role === "owner" || auth.role === "manager";
    const enabledModuleKeys = new Set(modules.filter((mod) => mod.enabled).map((mod) => mod.key));
    const groupRetailPOS = enabledModuleKeys.has("pos_terminal");
    const groupWholesale = enabledModuleKeys.has("sales_orders") || enabledModuleKeys.has("purchasing");
    const groupEnterprise = enabledModuleKeys.has("sso") || enabledModuleKeys.has("webhooks");
    const accountMode = groupEnterprise ? "ENTERPRISE" : groupWholesale ? "WHOLESALE" : "RETAIL";
    const effectiveFeatures = {
      ...flags,
      groupRetailPOS,
      groupWholesale,
      groupEnterprise,
      accountMode,
    };

    return {
      capabilitiesVersion: 1,
      tenant: {
        id: tenantId,
      },
      user: {
        id: auth.userId,
        role: auth.role,
        customRoleId: auth.customRoleId ?? null,
        storeIds: auth.storeIds,
        storeScope: auth.storeIds.length === 0 ? "all" : "restricted",
        permissions: auth.permissions,
        scopes: auth.scopes,
        allAccess,
        apiKeyRestricted: auth.scopes.length > 0,
      },
      business: {
        type: businessType,
        source: storedBusinessType && BUSINESS_BUNDLES[storedBusinessType] ? "stored" : "default",
        label: bundle.name,
        description: bundle.description,
        icon: bundle.icon,
      },
      plan,
      entitlements: {
        source: "placeholder",
        enforced: false,
        note: "Paid plan-to-module enforcement is not implemented yet; enabled modules currently come from business pack defaults plus feature flag overrides.",
      },
      features: effectiveFeatures,
      requiredFields: profile.requiredFields,
      workflows: profile.workflows,
      moduleGroups: GROUP_LABELS,
      availableBusinessTypes: Object.entries(BUSINESS_BUNDLES).map(([key, item]) => ({
        key,
        name: item.name,
        description: item.description,
        icon: item.icon,
        modules: item.modules,
      })),
      modules,
      coreModules: Array.from(CORE_MODULES),
    };
  }

  // ── Shipping methods ──────────────────────────────────────────────────────
  async listShipping(tenantId: string) {
    return this.db.query<ShippingMethod>("SELECT * FROM shipping_methods WHERE tenant_id = @t ORDER BY sequence ASC, name ASC LIMIT 200", { t: tenantId });
  }
  async createShipping(b: { name: string; amountCents: number; freeLimitCents?: number; ecommerce?: boolean; sequence?: number; creditAccountId?: string; debitAccountId?: string }, tenantId: string) {
    const row: ShippingMethod = { id: `shm_${uuidv7()}`, tenant_id: tenantId, name: b.name, amount_cents: b.amountCents, free_limit_cents: b.freeLimitCents ?? null, ecommerce: b.ecommerce ? 1 : 0, sequence: b.sequence ?? 0, credit_account_id: b.creditAccountId ?? null, debit_account_id: b.debitAccountId ?? null, active: 1 };
    await this.db.query(
      `INSERT INTO shipping_methods (id, tenant_id, name, amount_cents, free_limit_cents, ecommerce, sequence, credit_account_id, debit_account_id, active)
       VALUES (@id,@tenant_id,@name,@amount_cents,@free_limit_cents,@ecommerce,@sequence,@credit_account_id,@debit_account_id,@active)`,
      row as unknown as Record<string, unknown>,
    );
    return row;
  }
  async deleteShipping(id: string, tenantId: string) {
    const r = await this.db.one("SELECT id FROM shipping_methods WHERE id = @id AND tenant_id = @t", { id, t: tenantId });
    if (!r) throw notFound(`shipping method '${id}' not found`);
    await this.db.query("DELETE FROM shipping_methods WHERE id = @id AND tenant_id = @t", { id, t: tenantId });
    return { ok: true };
  }

  // ── Payment terms ─────────────────────────────────────────────────────────
  async listTerms(tenantId: string) { return this.db.query<PaymentTerm>("SELECT * FROM payment_terms WHERE tenant_id = @t ORDER BY days_due ASC LIMIT 200", { t: tenantId }); }
  async createTerm(b: { name: string; daysDue: number; description?: string }, tenantId: string) {
    const row: PaymentTerm = { id: `pt_${uuidv7()}`, tenant_id: tenantId, name: b.name, days_due: b.daysDue, description: b.description ?? null, active: 1 };
    await this.db.query("INSERT INTO payment_terms (id, tenant_id, name, days_due, description, active) VALUES (@id,@tenant_id,@name,@days_due,@description,@active)", row as unknown as Record<string, unknown>);
    return row;
  }

  // ── Payment modes ─────────────────────────────────────────────────────────
  async listModes(tenantId: string) { return this.db.query<PaymentMode>("SELECT * FROM payment_modes WHERE tenant_id = @t ORDER BY name ASC LIMIT 200", { t: tenantId }); }
  async createMode(b: { name: string }, tenantId: string) {
    const row: PaymentMode = { id: `pm_${uuidv7()}`, tenant_id: tenantId, name: b.name, active: 1 };
    await this.db.query("INSERT INTO payment_modes (id, tenant_id, name, active) VALUES (@id,@tenant_id,@name,@active)", row as unknown as Record<string, unknown>);
    return row;
  }

  // ── Tax rates ─────────────────────────────────────────────────────────────
  async listTaxRates(tenantId: string) { return this.db.query<TaxRate>("SELECT * FROM tax_rates WHERE tenant_id = @t ORDER BY name ASC LIMIT 200", { t: tenantId }); }
  async createTaxRate(b: { name: string; rateBps: number; applyToCategory?: string; state?: string }, tenantId: string) {
    const row: TaxRate = { id: `tax_${uuidv7()}`, tenant_id: tenantId, name: b.name, rate_bps: b.rateBps, apply_to_category: b.applyToCategory ?? null, state: b.state ?? null, active: 1 };
    await this.db.query("INSERT INTO tax_rates (id, tenant_id, name, rate_bps, apply_to_category, state, active) VALUES (@id,@tenant_id,@name,@rate_bps,@apply_to_category,@state,@active)", row as unknown as Record<string, unknown>);
    return row;
  }

  // ── Currencies ────────────────────────────────────────────────────────────
  async listCurrencies(tenantId: string) {
    return this.db.query(
      "SELECT * FROM supported_currencies WHERE tenant_id = @t AND is_active = true ORDER BY is_base DESC, currency_code ASC",
      { t: tenantId }
    );
  }

  // ── Receipt templates (one per outlet, stored in settings_kv) ─────────────

  private receiptKey(outletId: string) { return `receipt_template:${outletId}`; }

  private defaultReceipt(outletId: string) {
    return {
      outletId,
      headerText: "Thank you for visiting!",
      footerText: "See you again soon.",
      contactInfo: "",
      returnPolicy: "Returns accepted within 30 days with receipt.",
      showLogo: true,
      showBarcode: true,
      showTaxBreakdown: true,
    };
  }

  async getReceiptTemplate(outletId: string, tenantId: string) {
    return this.kvGet(this.receiptKey(outletId), tenantId, this.defaultReceipt(outletId));
  }

  async setReceiptTemplate(outletId: string, data: Record<string, unknown>, tenantId: string) {
    const current = await this.getReceiptTemplate(outletId, tenantId);
    const merged = { ...current, ...data, outletId };
    await this.kvSet(this.receiptKey(outletId), merged, tenantId);
    return merged;
  }

  /** Seed sensible defaults (idempotent: only when a table is empty). */
  async seedDefaults(tenantId: string) {
    const sm = await this.listShipping(tenantId);
    if (sm.length === 0) {
      await this.createShipping({ name: "Delivery", amountCents: 1500, sequence: 1, ecommerce: true }, tenantId);
      await this.createShipping({ name: "In-store Pickup", amountCents: 0, sequence: 2, ecommerce: true }, tenantId);
    }
    const pt = await this.listTerms(tenantId);
    if (pt.length === 0) {
      for (const [name, days] of [["COD", 0], ["Net 15", 15], ["Net 30", 30]] as Array<[string, number]>) await this.createTerm({ name, daysDue: days }, tenantId);
    }
    const pm = await this.listModes(tenantId);
    if (pm.length === 0) for (const name of ["Cash", "Check", "ACH", "Credit Card", "Wire"]) await this.createMode({ name }, tenantId);
    return { ok: true };
  }
}
