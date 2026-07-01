// Shared feature registry — single source of truth for RBAC feature IDs

export type FeatureId =
  | "register" | "sales" | "orders" | "quotes" | "returns" | "payments"
  | "price-override" | "void-transaction" | "service-orders"
  | "catalog" | "discounts" | "gift-cards" | "loyalty"
  | "inventory" | "purchasing" | "vendors" | "operations" | "delivery" | "shipping"
  | "customers" | "appointments"
  | "reports" | "insights" | "tax-compliance" | "finance" | "accounting" | "invoicing"
  | "ecommerce" | "workforce"
  | "team" | "settings" | "workflows" | "integrations" | "imports-exports" | "audit-log";

export interface FeatureDef {
  id: string;
  label: string;
  description: string;
}

export interface FeatureGroup {
  label: string;
  features: FeatureDef[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    label: "POS & Sales",
    features: [
      { id: "register",         label: "Register / Terminal",    description: "Open and operate the checkout terminal" },
      { id: "sales",            label: "Sales History",          description: "View and export past transactions" },
      { id: "orders",           label: "Orders",                 description: "View and manage all orders" },
      { id: "quotes",           label: "Quotes",                 description: "Create, send, and convert quotations" },
      { id: "returns",          label: "Returns & Refunds",      description: "Process returns and issue refunds" },
      { id: "payments",         label: "Payments",               description: "Accept payments and reconcile cash" },
      { id: "price-override",   label: "Price Override",         description: "Manually override product price at POS" },
      { id: "void-transaction", label: "Void Transaction",       description: "Void or cancel completed transactions" },
      { id: "service-orders",   label: "Service Orders",         description: "Create and manage repair/service tickets" },
    ],
  },
  {
    label: "Catalog",
    features: [
      { id: "catalog",    label: "Products",               description: "View and edit the product catalog" },
      { id: "discounts",  label: "Discounts & Promotions", description: "Create and manage discount rules" },
      { id: "gift-cards", label: "Gift Cards",             description: "Issue and redeem gift card balances" },
      { id: "loyalty",    label: "Loyalty Programme",      description: "Manage loyalty tiers, points, and rewards" },
    ],
  },
  {
    label: "Inventory",
    features: [
      { id: "inventory",  label: "Inventory Overview",    description: "View stock levels, alerts, and valuation" },
      { id: "purchasing", label: "Purchasing / POs",      description: "Create and receive purchase orders" },
      { id: "vendors",    label: "Vendors & Suppliers",   description: "Manage vendor accounts and terms" },
      { id: "operations", label: "Stock Operations",      description: "Counts, transfers, and adjustments" },
      { id: "delivery",   label: "Delivery & Routes",     description: "View delivery manifests and route assignments" },
      { id: "shipping",   label: "Shipping & Fulfilment", description: "Ship orders, print labels, manage carriers" },
    ],
  },
  {
    label: "Customers & CRM",
    features: [
      { id: "customers",    label: "Customers",    description: "View and manage customer profiles and history" },
      { id: "appointments", label: "Appointments", description: "Book and manage customer appointments" },
    ],
  },
  {
    label: "Finance & Reporting",
    features: [
      { id: "reports",        label: "Reports",          description: "Sales, inventory, and operational reports" },
      { id: "insights",       label: "Insights",         description: "AI-powered analytics and trends" },
      { id: "tax-compliance", label: "Tax Compliance",   description: "Tax reporting and regulatory compliance" },
      { id: "finance",        label: "Finance Overview",  description: "P&L, cash flow, and financial summary" },
      { id: "accounting",     label: "Accounting",        description: "Chart of accounts, journals, and reconciliation" },
      { id: "invoicing",      label: "Invoicing",         description: "Customer invoices and payment tracking" },
    ],
  },
  {
    label: "Online & Channels",
    features: [
      { id: "ecommerce", label: "Ecommerce", description: "Online store settings, sync, and channel management" },
    ],
  },
  {
    label: "Administration",
    features: [
      { id: "team",            label: "Team & Users",    description: "Manage staff accounts, roles, and clock-in/out" },
      { id: "workforce",       label: "Workforce",       description: "Shift scheduling and time-off requests" },
      { id: "settings",        label: "Settings",        description: "Business profile, taxes, and system preferences" },
      { id: "workflows",       label: "Workflows",       description: "Checkout automation and trigger rules" },
      { id: "integrations",    label: "Integrations",    description: "Third-party app connections and API keys" },
      { id: "imports-exports", label: "Import / Export", description: "Bulk data import, export, and migration" },
      { id: "audit-log",       label: "Audit Log",       description: "Full system event log with actor tracking" },
    ],
  },
];

export const ALL_FEATURES: string[] = FEATURE_GROUPS.flatMap((g) => g.features.map((f) => f.id));
