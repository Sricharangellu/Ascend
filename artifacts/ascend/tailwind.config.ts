import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/flags/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Brand — Ascend primary #5D5FEF ───────────────────────────────────
        brand: {
          50:  "#F5F5FE",
          100: "#E8E9FD",
          200: "#CBCCFA",
          300: "#AEAFF7",
          400: "#8A8CF3",
          500: "#6D6FF1",
          600: "#5D5FEF", // primary — WCAG AA on white (4.83:1)
          700: "#4F51D9",
          800: "#4345C3",
          900: "#3436A8",
          950: "#24267A",
        },

        // ── Shell — Stripe-style deep navy ───────────────────────────────────
        shell: {
          DEFAULT: "#0A2540",
          lighter: "#0D2D4E",
          "hover":  "rgba(255,255,255,0.06)",
          "active": "rgba(255,255,255,0.11)",
        },

        // ── Neutral / Slate ─────────────────────────────────────────────────
        // Professional gray scale (Stripe/Shopify inspired)
        neutral: {
          0:   "#FFFFFF",
          25:  "#FAFCFF",
          50:  "#F6F9FC",   // Stripe page bg
          75:  "#F0F4F8",
          100: "#E8EDF3",
          150: "#DDE3EC",
          200: "#CDD4DF",
          300: "#B0BECE",
          400: "#8FA5BB",
          500: "#697386",   // Stripe muted text
          600: "#4A5568",
          700: "#2D3748",
          800: "#1A2332",
          850: "#141D2B",
          900: "#0D1521",
          950: "#071020",
        },

        // ── ERP Design Tokens (CSS var–backed) ──────────────────────────────
        erp: {
          sidebar:           "#0A2540",
          "sidebar-active":  "#5D5FEF",
          header:            "#FFFFFF",
          "header-border":   "#E3E8EF",
          page:              "#F6F9FC",
          surface:           "#FFFFFF",
          border:            "#E3E8EF",
          "border-subtle":   "#F0F4F8",
          "table-header":    "#F8FAFC",
          "table-border":    "#EEF2F6",
          "text-primary":    "#1A1F36",
          "text-secondary":  "#697386",
          "text-muted":      "#9BA8B8",
          link:              "#5D5FEF",
          billed:            "#1890FF",
          "not-billed":      "#FA8C16",
        },

        // ── Semantic ─────────────────────────────────────────────────────────
        danger: {
          50:  "#FFF1F0",
          100: "#FFE4E2",
          200: "#FFA39E",
          300: "#FF7875",
          400: "#FF4D4F",
          500: "#F5222D",
          600: "#CF1322",
          700: "#A8071A",
        },
        success: {
          50:  "#F6FFED",
          100: "#D9F7BE",
          200: "#B7EB8F",
          300: "#95DE64",
          400: "#73D13D",
          500: "#52C41A",
          600: "#389E0D",
          700: "#237804",
        },
        warning: {
          50:  "#FFFBE6",
          100: "#FFF1B8",
          200: "#FFE58F",
          300: "#FFD666",
          400: "#FFC53D",
          500: "#FAAD14",
          600: "#D48806",
          700: "#AD6800",
        },
        info: {
          50:  "#E6F7FF",
          100: "#BAE7FF",
          200: "#91D5FF",
          300: "#69C0FF",
          400: "#40A9FF",
          500: "#1890FF",
          600: "#096DD9",
          700: "#0050B3",
        },
      },

      // ── Typography ─────────────────────────────────────────────────────────
      fontFamily: {
        sans: [
          "Inter",
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
        // ERP-specific tokens
        "erp-nav":   ["14px", { lineHeight: "1.5",  fontWeight: "500" }],
        "erp-table": ["13px", { lineHeight: "1.4" }],
        "erp-tag":   ["11px", { lineHeight: "1.4",  fontWeight: "600", letterSpacing: "0.03em" }],
        "erp-ui":    ["14px", { lineHeight: "1.5" }],
        "erp-label": ["11px", { lineHeight: "1.4",  fontWeight: "600", letterSpacing: "0.06em" }],
        "erp-micro": ["11px", { lineHeight: "1.4",  fontWeight: "500" }],
        // Typography scale
        "display":   ["28px", { lineHeight: "1.25", fontWeight: "700", letterSpacing: "-0.02em" }],
        "heading-xl":["22px", { lineHeight: "1.3",  fontWeight: "700", letterSpacing: "-0.015em" }],
        "heading-lg":["18px", { lineHeight: "1.35", fontWeight: "600", letterSpacing: "-0.01em" }],
        "heading-md":["15px", { lineHeight: "1.4",  fontWeight: "600" }],
        "heading-sm":["13px", { lineHeight: "1.4",  fontWeight: "600" }],
        "body-lg":   ["15px", { lineHeight: "1.6" }],
        "body":      ["14px", { lineHeight: "1.5" }],
        "body-sm":   ["13px", { lineHeight: "1.45" }],
        "caption":   ["12px", { lineHeight: "1.4" }],
        "micro":     ["11px", { lineHeight: "1.4",  fontWeight: "500", letterSpacing: "0.01em" }],
      },

      // ── Spacing ────────────────────────────────────────────────────────────
      spacing: {
        "4.5": "18px",
        "13":  "52px",
        "15":  "60px",
        "18":  "72px",
        "22":  "88px",
        "26":  "104px",
      },

      // ── Border radius ──────────────────────────────────────────────────────
      borderRadius: {
        DEFAULT:  "6px",
        "xs":     "3px",
        "sm":     "4px",
        "md":     "6px",
        "lg":     "8px",
        "xl":     "12px",
        "2xl":    "16px",
        "tag":    "4px",
        "pill":   "9999px",
      },

      // ── Box shadows ────────────────────────────────────────────────────────
      boxShadow: {
        "xs":    "0 1px 2px rgba(0,0,0,0.04)",
        "sm":    "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        "md":    "0 4px 8px -2px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.04)",
        "lg":    "0 12px 20px -4px rgba(0,0,0,0.08), 0 4px 8px -4px rgba(0,0,0,0.04)",
        "xl":    "0 24px 32px -8px rgba(0,0,0,0.10), 0 8px 16px -4px rgba(0,0,0,0.04)",
        "focus": "0 0 0 3px rgba(93,95,239,0.25)",
        "focus-danger": "0 0 0 3px rgba(207,19,34,0.2)",
        // Legacy
        "primary": "rgba(93,95,239,0.15) 0px 2px 0px 0px",
      },

      // ── Layout ─────────────────────────────────────────────────────────────
      height: {
        "topbar":    "52px",
        "erp-header":"52px",
        "erp-btn":   "32px",
        "touch":     "44px",
      },
      width: {
        "sidebar-expanded":  "224px",
        "sidebar-collapsed": "52px",
      },
      minHeight: {
        "touch": "44px",
      },
      minWidth: {
        "touch": "44px",
      },

      // ── Animations ─────────────────────────────────────────────────────────
      transitionTimingFunction: {
        "spring": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-up": {
          "0%":   { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%":   { opacity: "0", transform: "translateX(100%)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          "0%":   { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "skeleton": {
          "0%":   { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "fade-in":       "fade-in 0.15s ease-out",
        "fade-up":       "fade-up 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-right":"slide-in-right 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in":      "scale-in 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
        "skeleton":      "skeleton 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
