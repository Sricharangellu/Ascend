import type { Config } from "tailwindcss";

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
        // ── Brand (Ascend primary: #5D5FEF) ─────────────────────────────────
        // Unified 2026-07-14: #5D5FEF was already the de facto primary across
        // ~75 pages/components (buttons, links, active tabs) despite #0137FC
        // being the only documented token. #5D5FEF matched real usage more
        // widely, so it is now the canonical brand-600 — see AGENTS.md
        // "Design System Rules". Full 50–950 ramp generated from this base.
        brand: {
          50:  "#F5F5FE",
          100: "#E8E9FD",
          200: "#CBCCFA",
          300: "#AEAFF7",
          400: "#8A8CF3",
          500: "#6D6FF1",
          600: "#5D5FEF", // primary — WCAG AA on white (4.83:1)
          700: "#5052CE",
          800: "#4344AC",
          900: "#36378B",
          950: "#292A69",
        },
        // ── ERP Design Tokens ────────────────────────────────────────────────
        erp: {
          sidebar:     "#030B25", // dark navy sidebar
          "sidebar-active": "#5D5FEF",
          header:      "#F7F7F7",
          "header-border": "rgb(229,220,220)",
          page:        "#F9F9F9",
          "table-header": "#FAFAFA",
          "table-border": "#F0F0F0",
          "text-primary":   "rgba(0,0,0,0.88)",
          "text-secondary": "rgba(0,0,0,0.45)",
          link:        "#5D5FEF",
          billed:      "#1890FF", // "Billed" status tag
          "not-billed": "#FA8C16", // "Not Billed" / "Pending"
        },
        // ── Semantic ─────────────────────────────────────────────────────────
        // Completed 2026-08-11: the ramps below stopped at 50/100/500/600/700,
        // but pages and primitives already referenced `-200`/`-300`/`-400`/`-800`
        // and a whole `info-*` family that was never declared — Tailwind emits
        // nothing for an undeclared stop, so `Badge variant="blue"` rendered with
        // no background, text colour, or border at all, and ~20 alert boxes drew
        // a border-width with no border colour. Filling the ramps is purely
        // additive: every stop that already existed keeps its exact value, so
        // nothing that renders today changes — the dead classes simply come
        // alive. Values follow the same ramp the original stops were taken from,
        // and the `-200` stops were chosen to equal the `--color-*-border` vars
        // in globals.css so borders match the documented intent.
        danger: {
          50:  "#FFF1F0",
          100: "#FFE4E2",
          200: "#FFCCC7",
          300: "#FFA39E", // = --color-danger-border
          400: "#FF7875",
          500: "#FF4D4F",
          600: "#F5222D",
          700: "#CF1322", // AA on danger-50 (5.07:1)
          800: "#A8071A",
          900: "#820014", // = --color-danger-text
        },
        success: {
          50:  "#F6FFED",
          100: "#D9F7BE",
          200: "#B7EB8F", // = --color-success-border
          300: "#95DE64",
          400: "#73D13D",
          500: "#52C41A",
          600: "#389E0D",
          700: "#237804", // AA on success-50 (5.51:1)
          800: "#135200",
          900: "#092B00",
        },
        warning: {
          50:  "#FFFBE6",
          100: "#FFF1B8",
          200: "#FFE58F", // = --color-warning-border
          300: "#FFD666",
          400: "#FFC53D",
          500: "#FAAD14",
          600: "#D48806",
          700: "#AD6800",
          800: "#874D00", // = --color-warning-text; AA on warning-50 (6.53:1)
          900: "#613400",
        },
        // Informational / "in flight" — the family globals.css already declared
        // as --color-info-* and erp.billed (#1890FF), now a real Tailwind ramp.
        info: {
          50:  "#E6F7FF", // = --color-info-bg
          100: "#BAE7FF",
          200: "#91D5FF", // = --color-info-border
          300: "#69C0FF",
          400: "#40A9FF",
          500: "#1890FF", // = erp.billed
          600: "#096DD9", // = --color-info; AA on info-50 (4.60:1)
          700: "#0050B3",
          800: "#003A8C", // = --color-info-text
          900: "#002766",
        },
      },
      minHeight: { touch: "44px" },
      minWidth:  { touch: "44px" },
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
      fontSize: {
        "erp-nav":   ["16px", { lineHeight: "1.5" }],
        "erp-table": ["13px", { lineHeight: "1.4" }],
        "erp-tag":   ["12px", { lineHeight: "1.4" }],
        "erp-ui":    ["14px", { lineHeight: "1.5" }],
      },
      borderRadius: {
        DEFAULT: "6px",
        tag: "4px",
      },
      boxShadow: {
        // Was rgba(1,55,252,…) — the retired #0137FC brand. Re-anchored on the
        // canonical brand-600 (#5D5FEF) so focus rings match the primary colour.
        focus:   "0 0 0 3px rgba(93,95,239,0.30)",
        primary: "rgba(93,95,239,0.10) 0px 2px 0px 0px",
        // Elevation scale. `Card` already asked for `shadow-[var(--shadow-sm)]`,
        // but no such variable was ever declared, so cards rendered flat. The
        // vars now exist in globals.css (and are re-toned for dark mode); these
        // aliases give them a first-class utility name.
        "elev-sm": "var(--shadow-sm)",
        "elev-md": "var(--shadow-md)",
        "elev-lg": "var(--shadow-lg)",
      },
      height: {
        "erp-header": "77px",
        "erp-btn":    "32px",
      },
    },
  },
  plugins: [],
};

export default config;
