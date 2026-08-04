"use client";

import Link from "next/link";

export function DashboardHero() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-600/20 bg-gradient-to-br from-[#0A2540] to-brand-900 shadow-xl">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10 mix-blend-overlay"></div>

      {/* Decorative grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:24px_24px]"></div>

      <div className="relative z-10 flex flex-col items-start px-8 py-10 lg:px-12 lg:py-16">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-200 backdrop-blur-md">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500"></span>
          </span>
          System Online
        </div>

        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
          The Intelligent Enterprise Operations Platform
        </h1>

        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-brand-100/80 sm:text-base">
          One platform to manage every aspect of your business—Purchasing • Inventory • Sales • Finance • Warehousing • Distribution • CRM • Analytics.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/reports"
            className="inline-flex h-11 min-h-touch items-center justify-center rounded-lg bg-brand-500 px-6 text-[13px] font-semibold text-white shadow-md shadow-brand-500/20 transition-colors hover:bg-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            Executive Dashboard
          </Link>
          <Link
            href="/settings"
            className="inline-flex h-11 min-h-touch items-center justify-center rounded-lg border border-white/20 bg-white/5 px-6 text-[13px] font-medium text-white backdrop-blur-sm transition-colors hover:border-white/30 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            Configuration
          </Link>
        </div>
      </div>

      {/* Abstract Visualization */}
      <div className="absolute right-0 top-0 hidden h-full w-1/2 lg:block">
        <div className="absolute inset-0 bg-gradient-to-l from-transparent to-[#0A2540]"></div>
        <div className="relative h-full w-full opacity-60">
          <svg className="absolute right-[-10%] top-[-20%] h-[150%] w-[150%] animate-[spin_60s_linear_infinite]" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
            <circle cx="400" cy="400" r="300" fill="none" stroke="currentColor" strokeWidth="1" className="text-brand-500/20" strokeDasharray="4 8" />
            <circle cx="400" cy="400" r="200" fill="none" stroke="currentColor" strokeWidth="1" className="text-brand-400/20" strokeDasharray="2 4" />
            <circle cx="400" cy="400" r="100" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-300/30" />
            <path d="M400 100 L400 700 M100 400 L700 400" stroke="currentColor" strokeWidth="1" className="text-brand-500/20" />
            <circle cx="400" cy="100" r="4" fill="currentColor" className="text-brand-300 shadow-xl" />
            <circle cx="700" cy="400" r="4" fill="currentColor" className="text-brand-300" />
            <circle cx="400" cy="700" r="4" fill="currentColor" className="text-brand-300" />
            <circle cx="100" cy="400" r="4" fill="currentColor" className="text-brand-300" />
          </svg>
        </div>
      </div>
    </div>
  );
}
