export default function Slide06Wholesale() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#0A0D17] font-display text-white">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50vw 45vh at 50% 90%, rgba(93,95,239,0.10) 0%, transparent 55%), radial-gradient(ellipse 40vw 35vh at 90% 10%, rgba(139,92,246,0.09) 0%, transparent 55%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "4vw 4vw",
        }}
      />

      {/* Logo */}
      <div className="absolute top-[4vh] left-[5vw] z-10 flex items-center gap-[0.8vw]">
        <div className="w-[1.8vw] h-[1.8vw] bg-primary rounded-[0.35vw]" />
        <span className="text-[1.2vw] font-bold tracking-tight">Ascend</span>
      </div>
      <span className="absolute top-[4vh] right-[5vw] z-10 text-[1vw] text-white/40">
        2026
      </span>

      {/* Content */}
      <div
        className="absolute z-10 flex flex-col"
        style={{ top: "12vh", bottom: "11vh", left: "6vw", right: "6vw" }}
      >
        {/* Header */}
        <div className="mb-[3.5vh]">
          <span className="text-[1vw] font-semibold tracking-[0.12em] uppercase text-primary/80">
            Product
          </span>
          <h2 className="text-[3.5vw] font-extrabold tracking-tight leading-[1.1] mt-[1.5vh]">
            B2B operations, fully integrated
          </h2>
        </div>

        {/* 2×2 grid */}
        <div className="flex-1 grid grid-cols-2 gap-[2vw]">
          {/* Cell 1: Sales Orders */}
          <div
            className="flex gap-[1.5vw] p-[2.2vw] rounded-[1vw]"
            style={{ background: "rgba(19,24,41,0.8)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div
              className="shrink-0 w-[3.5vw] h-[3.5vw] rounded-[0.7vw] flex items-center justify-center text-primary"
              style={{ background: "rgba(93,95,239,0.12)" }}
            >
              <svg className="w-[1.8vw] h-[1.8vw]" viewBox="0 0 24 24" fill="none">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-[2vw] font-bold mb-[0.8vh]">Sales Orders</p>
              <p className="text-[1.65vw] text-white/50 leading-[1.4]">
                Create, quote, and fulfill wholesale orders from placement through delivery in a single workflow
              </p>
            </div>
          </div>

          {/* Cell 2: Purchase Orders */}
          <div
            className="flex gap-[1.5vw] p-[2.2vw] rounded-[1vw]"
            style={{ background: "rgba(19,24,41,0.8)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div
              className="shrink-0 w-[3.5vw] h-[3.5vw] rounded-[0.7vw] flex items-center justify-center text-primary"
              style={{ background: "rgba(93,95,239,0.12)" }}
            >
              <svg className="w-[1.8vw] h-[1.8vw]" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </div>
            <div>
              <p className="text-[2vw] font-bold mb-[0.8vh]">Purchase Orders</p>
              <p className="text-[1.65vw] text-white/50 leading-[1.4]">
                Track vendor orders from placement through receipt — linked directly to inventory receiving
              </p>
            </div>
          </div>

          {/* Cell 3: Invoicing */}
          <div
            className="flex gap-[1.5vw] p-[2.2vw] rounded-[1vw]"
            style={{ background: "rgba(19,24,41,0.8)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div
              className="shrink-0 w-[3.5vw] h-[3.5vw] rounded-[0.7vw] flex items-center justify-center text-primary"
              style={{ background: "rgba(93,95,239,0.12)" }}
            >
              <svg className="w-[1.8vw] h-[1.8vw]" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 7h8M8 11h8M8 15h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-[2vw] font-bold mb-[0.8vh]">Invoicing</p>
              <p className="text-[1.65vw] text-white/50 leading-[1.4]">
                Send invoices, track payments, enforce customer credit limits, and flag overdue accounts
              </p>
            </div>
          </div>

          {/* Cell 4: Vendor Management */}
          <div
            className="flex gap-[1.5vw] p-[2.2vw] rounded-[1vw]"
            style={{ background: "rgba(19,24,41,0.8)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div
              className="shrink-0 w-[3.5vw] h-[3.5vw] rounded-[0.7vw] flex items-center justify-center text-primary"
              style={{ background: "rgba(93,95,239,0.12)" }}
            >
              <svg className="w-[1.8vw] h-[1.8vw]" viewBox="0 0 24 24" fill="none">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-[2vw] font-bold mb-[0.8vh]">Vendor Management</p>
              <p className="text-[1.65vw] text-white/50 leading-[1.4]">
                Maintain vendor records, pricing agreements, order history, and contact information in one place
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-[3.5vh] left-[5vw] z-10 text-[0.9vw] text-white/20 tracking-[0.08em] uppercase">
        Ascend POS, Inc.
      </div>
      <div className="absolute bottom-[3.5vh] right-[5vw] z-10 text-[0.9vw] text-white/20">
        06 / 10
      </div>
    </div>
  );
}
