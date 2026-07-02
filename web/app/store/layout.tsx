"use client";

import { useEffect } from "react";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Ensure MSW is running for mock API calls
    if (typeof window !== "undefined") {
      import("@/mocks/browser").then(({ startMsw }) => startMsw()).catch(() => {});
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* Store header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="/store" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#5D5FEF]">
              <svg className="h-4.5 w-4.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
            </div>
            <span className="text-base font-bold text-[#111]">FinderPOS Store</span>
          </a>
          <nav className="hidden sm:flex items-center gap-5 text-sm font-medium text-slate-500">
            <a href="/store" className="hover:text-[#111] transition-colors">Products</a>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="mt-16 border-t border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
        Powered by FinderPOS · All prices include tax where applicable
      </footer>
    </div>
  );
}
