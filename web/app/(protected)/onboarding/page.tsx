"use client";

/**
 * UX-1: Onboarding Wizard — first-run experience for new tenants.
 * Shows all 13 business verticals; saves business profile on completion.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, safeLoad } from "@/api-client/client";
import { invalidateModuleFlagsCache } from "@/hooks/useModuleFlags";

const BUSINESS_TYPES = [
  { key: "retail",        icon: "🏪", name: "Retail Store",         desc: "Convenience, fashion, electronics, pharmacy, pet, sporting goods" },
  { key: "restaurant",    icon: "🍽️", name: "Restaurant / Café",    desc: "Dine-in, takeaway, bar, food truck, bakery, coffee shop" },
  { key: "wholesale",     icon: "📦", name: "B2B / Wholesale",       desc: "Distributor, wholesaler, FMCG supplier, food & beverage" },
  { key: "hospitality",   icon: "🏨", name: "Hotel / Resort",        desc: "Room billing, guest accounts, spa, events, boutique hotel" },
  { key: "services",      icon: "✂️", name: "Services & Repairs",    desc: "Salon, spa, repair shop, laundry, tailoring, car wash" },
  { key: "healthcare",    icon: "🏥", name: "Healthcare / Pharmacy", desc: "Pharmacy, clinic, medical store, diagnostic lab, optical" },
  { key: "manufacturing", icon: "🏭", name: "Manufacturing",         desc: "Factory outlet, production floor, direct-to-consumer brand" },
  { key: "ecommerce",     icon: "🛒", name: "E-Commerce",            desc: "Online store, marketplace seller, click-and-collect, D2C" },
  { key: "automotive",    icon: "🚗", name: "Automotive",            desc: "Auto parts, tire shop, vehicle workshop, service center" },
  { key: "rental",        icon: "🔑", name: "Rental",                desc: "Equipment hire, vehicle rental, event equipment, tool hire" },
  { key: "entertainment", icon: "🎭", name: "Entertainment",         desc: "Cinema, theme park, museum, gaming center, sports venue" },
  { key: "education",     icon: "🎓", name: "Education",             desc: "Training institute, coaching center, school, university" },
  { key: "golf",          icon: "⛳", name: "Golf / Sports",         desc: "Golf course, driving range, pro shop, sports club, resort" },
];

type Step = "welcome" | "type" | "confirm";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep]             = useState<Step>("welcome");
  const [selected, setSelected]     = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);

  const selectedBt = BUSINESS_TYPES.find(b => b.key === selected);

  const progress = { welcome: 25, type: 65, confirm: 100 }[step];

  const handleFinish = () => {
    if (!selected) return;
    setSaving(true);
    safeLoad(
      apiPost("/api/v1/settings/business-profile", { businessType: selected })
        .then(() => { invalidateModuleFlagsCache(); router.replace("/dashboard"); })
        .catch(() => router.replace("/dashboard")),
    );
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#030B25] via-[#071435] to-[#0a1535] px-4 py-12">

      {/* Branding */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white shadow-lg">F</div>
        <div>
          <p className="text-xl font-bold text-white leading-none">Finder POS</p>
          <p className="text-xs text-white/40">Enterprise Platform</p>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-8 w-full max-w-lg">
        <div className="h-1 rounded-full bg-white/10">
          <div className="h-1 rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-white/30">
          <span>Welcome</span><span>Business type</span><span>Launch</span>
        </div>
      </div>

      {/* ── Step: Welcome ──────────────────────────────────────────── */}
      {step === "welcome" && (
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl text-center">
          <div className="mb-5 text-5xl">👋</div>
          <h1 className="mb-2 text-2xl font-bold text-[var(--color-text-primary)]">Welcome to Finder POS</h1>
          <p className="mb-6 text-sm text-[var(--color-text-secondary)]">
            The enterprise POS that adapts to your business — retail, restaurant, wholesale, healthcare, automotive, and more. Let's set you up in under a minute.
          </p>
          <div className="mb-6 grid grid-cols-3 gap-3">
            {[
              { icon: "⚡", label: "30-second setup" },
              { icon: "🎯", label: "Right features unlocked" },
              { icon: "🔓", label: "Change anytime" },
            ].map(({ icon, label }) => (
              <div key={label} className="rounded-xl bg-brand-50 p-3 text-center">
                <div className="text-2xl">{icon}</div>
                <p className="mt-1 text-[11px] font-medium text-brand-700">{label}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStep("type")}
            className="w-full rounded-xl bg-brand-600 py-3.5 text-base font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Get Started →
          </button>
        </div>
      )}

      {/* ── Step: Choose business type ─────────────────────────────── */}
      {step === "type" && (
        <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
          <h2 className="mb-1 text-xl font-bold text-[var(--color-text-primary)]">What type of business are you?</h2>
          <p className="mb-5 text-sm text-[var(--color-text-secondary)]">
            Select your industry — we'll activate exactly the right modules for you.
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {BUSINESS_TYPES.map((bt) => (
              <button
                key={bt.key}
                type="button"
                onClick={() => { setSelected(bt.key); setStep("confirm"); }}
                className={`group flex flex-col rounded-xl border-2 p-3 text-left transition-all hover:border-brand-500 hover:bg-brand-50 hover:shadow-sm ${
                  selected === bt.key ? "border-brand-600 bg-brand-50" : "border-[#E5E7EB]"
                }`}
              >
                <span className="mb-1.5 text-2xl">{bt.icon}</span>
                <span className="text-sm font-semibold leading-tight text-[var(--color-text-primary)]">{bt.name}</span>
                <span className="mt-0.5 text-[11px] leading-tight text-[var(--color-text-secondary)] line-clamp-2">{bt.desc}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setStep("welcome")}
            className="mt-4 w-full text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
            ← Back
          </button>
        </div>
      )}

      {/* ── Step: Confirm + launch ─────────────────────────────────── */}
      {step === "confirm" && selectedBt && (
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl text-center">
          <div className="mb-3 text-5xl">{selectedBt.icon}</div>
          <h2 className="mb-1 text-xl font-bold text-[var(--color-text-primary)]">{selectedBt.name}</h2>
          <p className="mb-6 text-sm text-[var(--color-text-secondary)]">{selectedBt.desc}</p>

          <div className="mb-6 rounded-xl bg-green-50 border border-green-200 px-4 py-4 text-left space-y-1.5">
            {[
              "The right modules will be activated automatically",
              "Other features stay hidden to keep the interface clean",
              "Add individual modules later via Setup → Business Profile",
              "Switch business type at any time without losing data",
            ].map((line) => (
              <p key={line} className="flex items-start gap-2 text-sm text-green-800">
                <span className="mt-0.5 text-green-600">✓</span>
                {line}
              </p>
            ))}
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={handleFinish}
            className="w-full rounded-xl bg-brand-600 py-3.5 text-base font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Setting up…" : `Launch as ${selectedBt.name} →`}
          </button>
          <button
            type="button"
            onClick={() => setStep("type")}
            className="mt-3 w-full text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            ← Choose different type
          </button>
        </div>
      )}

      <p className="mt-8 text-xs text-white/20">You can change your business profile anytime in Settings</p>
    </div>
  );
}
