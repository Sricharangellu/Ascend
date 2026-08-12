import type { Config } from "tailwindcss";

/**
 * ASCEND DESIGN SYSTEM — "Structure & Signal"
 *
 * Identity: Graphite chrome + Signal Teal accent.
 *
 * ── The one rule that keeps this consistent ────────────────────────────────
 * `app/globals.css` is the source of colour truth. Every token here that CAN
 * point at a CSS variable DOES, so a Tailwind utility (`bg-surface-2`) and a
 * raw `var(--color-surface-2)` reference always resolve to the same colour and
 * both follow dark mode for free.
 *
 * The `brand.*` ramp is the ONE exception: it is consumed with Tailwind opacity
 * modifiers in 20+ places (`bg-brand-600/5`, `ring-brand-600/20`), and those do
 * not work through `var()`. It is therefore mirrored here as hex and MUST be
 * kept equal to `--accent-*` in globals.css. `npm run tokens:check` asserts it.
 *
 * Audit that motivated this file:
 *   WORK/audits/AUDIT_2026-08-10T174500Z-ui-ux-platform-audit.md
 */

/** Signal Teal ramp — mirror of --accent-* in globals.css. Keep in sync. */
const accent = {
  50: "#F0FAF8",
  100: "#D6F2EE",
  200: "#A9E5DC",
  300: "#74D2C5",
  400: "#3CB5A5",
  500: "#17998A",
  600: "#0B7A6E", // primary — white text 5.22:1 (AA)
  700: "#086358", // hover   — white text 7.05:1 (AAA)
  800: "#064E45",
  900: "#053E37",
  950: "#032622",
} as const;

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./flags/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Brand / accent ────────────────────────────────────────────────
        // `brand` is retained as the historical name (700+ usages) and now
        // resolves to Signal Teal. `accent` is the name new code should use.
        brand: accent,
        accent: accent,

        // ── Semantic surfaces — prefer these in all new code ──────────────
        canvas: "var(--color-canvas)",
        surface: {
          DEFAULT: "var(--color-surface-1)",
          1: "var(--color-surface-1)",
          2: "var(--color-surface-2)",
          3: "var(--color-surface-3)",
          overlay: "var(--color-surface-overlay)",
        },
        line: {
          subtle: "var(--color-border-subtle)",
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        content: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
          inverse: "var(--color-text-inverse)",
        },
        chrome: {
          DEFAULT: "var(--color-sidebar-bg)",
          flyout: "var(--color-sidebar-flyout)",
          hover: "var(--color-sidebar-hover)",
          active: "var(--color-sidebar-active)",
          border: "var(--color-sidebar-border)",
        },

        // ── ERP namespace — LEGACY, retained so the ~245 existing usages keep
        // working. Now pointed at the same CSS variables as everything else,
        // which is what fixes the cross-module drift: `bg-erp-page` and
        // `var(--color-page-bg)` were previously DIFFERENT colours.
        // Do not use in new code; prefer the semantic names above.
        erp: {
          sidebar: "var(--color-sidebar-bg)",
          "sidebar-active": "var(--color-sidebar-active)",
          header: "var(--color-header-bg)",
          "header-border": "var(--color-header-border)",
          page: "var(--color-page-bg)",
          "table-header": "var(--color-table-header)",
          "table-border": "var(--color-table-border)",
          "text-primary": "var(--color-text-primary)",
          "text-secondary": "var(--color-text-secondary)",
          link: "var(--color-link)",
          billed: "var(--color-billed)",
          "not-billed": "var(--color-not-billed)",
        },

        // ── Status ────────────────────────────────────────────────────────
        // Ramp keys kept (50/100/500/600/700) for source compatibility; the
        // values now come from the single token set and follow dark mode.
        danger: {
          50: "var(--color-danger-bg)",
          100: "var(--color-danger-border)",
          500: "var(--color-danger)",
          600: "var(--color-danger)",
          700: "var(--color-danger-text)",
          bg: "var(--color-danger-bg)",
          border: "var(--color-danger-border)",
        },
        success: {
          50: "var(--color-success-bg)",
          100: "var(--color-success-border)",
          500: "var(--color-success)",
          600: "var(--color-success)",
          700: "var(--color-success-text)",
          bg: "var(--color-success-bg)",
          border: "var(--color-success-border)",
        },
        warning: {
          50: "var(--color-warning-bg)",
          100: "var(--color-warning-border)",
          500: "var(--color-warning)",
          600: "var(--color-warning)",
          700: "var(--color-warning-text)",
          bg: "var(--color-warning-bg)",
          border: "var(--color-warning-border)",
        },
        info: {
          50: "var(--color-info-bg)",
          100: "var(--color-info-border)",
          500: "var(--color-info)",
          600: "var(--color-info)",
          700: "var(--color-info-text)",
          bg: "var(--color-info-bg)",
          border: "var(--color-info-border)",
        },
      },

      minHeight: { touch: "44px", row: "var(--row-h)", control: "var(--control-h)" },
      minWidth: { touch: "44px" },

      fontFamily: {
        sans: [
          "-apple-system",
          '"system-ui"',
          '"Segoe UI"',
          "Roboto",
          "Oxygen",
          "Ubuntu",
          '"Helvetica Neue"',
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },

      // ── Type scale — 7 steps, tight by design. Enterprise density wants a
      // compressed scale; the previous four `erp-*` sizes had no headings.
      fontSize: {
        "2xs": ["11px", { lineHeight: "16px", letterSpacing: "0.01em" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "18px" }], // table + body default
        base: ["14px", { lineHeight: "20px" }],
        md: ["16px", { lineHeight: "24px" }],
        lg: ["20px", { lineHeight: "28px", letterSpacing: "-0.01em" }], // page title
        xl: ["28px", { lineHeight: "34px", letterSpacing: "-0.02em" }], // hero metric
        // Legacy aliases — retained so existing markup keeps compiling.
        "erp-nav": ["16px", { lineHeight: "1.5" }],
        "erp-table": ["13px", { lineHeight: "1.4" }],
        "erp-tag": ["12px", { lineHeight: "1.4" }],
        "erp-ui": ["14px", { lineHeight: "1.5" }],
      },

      // Space: the 4px ladder (4/8/12/16/24/32/48) is Tailwind's default scale
      // already, so there is nothing to redefine here. Restricting the app to
      // that subset is a lint concern (Phase 5), not a config one — overriding
      // `spacing` in `extend` would not remove the other steps anyway, and 175
      // off-ladder usages exist today.

      // Deliberately tighter than the old 6px default — large radii are the
      // strongest "generic template" signal.
      borderRadius: {
        DEFAULT: "4px",
        control: "4px",
        container: "6px",
        tag: "4px",
      },

      boxShadow: {
        // Derived from the accent. The previous value was rgba(1,55,252,.3) —
        // the brand colour retired on 2026-07-14 — so every focus ring in the
        // app was a different hue from the button it sat on.
        focus: "var(--focus-ring)",
        // Shadows exist ONLY for things that genuinely float.
        popover: "0 4px 12px -2px rgba(12,16,20,0.12), 0 2px 4px -2px rgba(12,16,20,0.08)",
        modal: "0 16px 48px -8px rgba(12,16,20,0.24), 0 4px 12px -4px rgba(12,16,20,0.12)",
        primary: "none",
      },

      height: {
        "erp-header": "56px",
        "erp-btn": "var(--control-h)",
        row: "var(--row-h)",
        control: "var(--control-h)",
      },

      // Desktop breakpoints. PURELY ADDITIVE — sm…2xl keep Tailwind's default
      // values so the 3 existing `2xl:` usages do not shift. The default scale
      // stopped at 1536, leaving 1600 and 1920 undifferentiated; these two add
      // the ultrawide steps the desktop-first directive requires.
      screens: {
        "3xl": "1600px",
        "4xl": "1920px",
      },

      maxWidth: {
        // ONE page width. Replaces the six competing max-w-* answers found in
        // the audit (7xl/6xl/5xl/4xl/2xl/[1400px]).
        page: "1600px",
        prose: "72ch",
      },
    },
  },
  plugins: [],
};

export default config;
