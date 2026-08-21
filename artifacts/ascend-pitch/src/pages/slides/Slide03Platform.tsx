export default function Slide03Platform() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#0A0D17] font-display text-white">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55vw 45vh at 50% 10%, rgba(93,95,239,0.12) 0%, transparent 55%), radial-gradient(ellipse 40vw 35vh at 10% 90%, rgba(139,92,246,0.08) 0%, transparent 55%)",
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
        <div className="text-center mb-[4vh]">
          <span className="text-[1vw] font-semibold tracking-[0.12em] uppercase text-primary/80">
            The Solution
          </span>
          <h2 className="text-[3.8vw] font-extrabold tracking-tight leading-[1.1] mt-[1.5vh] text-balance">
            One platform. Every operation.
          </h2>
          <p className="text-[1.9vw] text-white/50 mt-[1.5vh] text-balance">
            Ascend unifies POS, inventory, and wholesale into a single multi-tenant system
          </p>
        </div>

        {/* Three columns */}
        <div className="flex-1 grid grid-cols-3 gap-[2vw]">
          {/* Column 1: POS Terminal */}
          <div
            className="flex flex-col p-[2.5vw] rounded-[1.2vw]"
            style={{
              background: "rgba(19,24,41,0.8)",
              border: "1px solid rgba(93,95,239,0.25)",
            }}
          >
            {/* Icon */}
            <div
              className="w-[4.5vw] h-[4.5vw] rounded-[0.8vw] mb-[2vh] flex items-center justify-center text-primary"
              style={{ background: "rgba(93,95,239,0.12)" }}
            >
              <svg className="w-[2.2vw] h-[2.2vw]" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="3" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 21h8M12 16v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-[2.2vw] font-bold mb-[1.5vh]">POS Terminal</p>
            <p className="text-[1.7vw] text-white/55 leading-[1.5]">
              Fast barcode checkout with split tender, gift cards, and offline mode with automatic sync
            </p>
            <div className="mt-[2.5vh] flex flex-col gap-[1.2vh]">
              <div className="flex items-center gap-[0.7vw]">
                <div className="w-[0.4vw] h-[0.4vw] rounded-full bg-primary shrink-0" />
                <span className="text-[1.5vw] text-white/50">Barcode scanner support</span>
              </div>
              <div className="flex items-center gap-[0.7vw]">
                <div className="w-[0.4vw] h-[0.4vw] rounded-full bg-primary shrink-0" />
                <span className="text-[1.5vw] text-white/50">Per-item discounts</span>
              </div>
              <div className="flex items-center gap-[0.7vw]">
                <div className="w-[0.4vw] h-[0.4vw] rounded-full bg-primary shrink-0" />
                <span className="text-[1.5vw] text-white/50">Offline-first architecture</span>
              </div>
            </div>
          </div>

          {/* Column 2: Inventory */}
          <div
            className="flex flex-col p-[2.5vw] rounded-[1.2vw]"
            style={{
              background: "rgba(19,24,41,0.8)",
              border: "1px solid rgba(93,95,239,0.25)",
            }}
          >
            {/* Icon */}
            <div
              className="w-[4.5vw] h-[4.5vw] rounded-[0.8vw] mb-[2vh] flex items-center justify-center text-primary"
              style={{ background: "rgba(93,95,239,0.12)" }}
            >
              <svg className="w-[2.2vw] h-[2.2vw]" viewBox="0 0 24 24" fill="none">
                <path d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5L12 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M4 7.5L12 12M20 7.5L12 12M12 12V21" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </div>
            <p className="text-[2.2vw] font-bold mb-[1.5vh]">Inventory Control</p>
            <p className="text-[1.7vw] text-white/55 leading-[1.5]">
              Multi-location stock with batch and lot tracking, expiry date alerts, and reorder automation
            </p>
            <div className="mt-[2.5vh] flex flex-col gap-[1.2vh]">
              <div className="flex items-center gap-[0.7vw]">
                <div className="w-[0.4vw] h-[0.4vw] rounded-full bg-primary shrink-0" />
                <span className="text-[1.5vw] text-white/50">Multi-location visibility</span>
              </div>
              <div className="flex items-center gap-[0.7vw]">
                <div className="w-[0.4vw] h-[0.4vw] rounded-full bg-primary shrink-0" />
                <span className="text-[1.5vw] text-white/50">Batch and lot tracking</span>
              </div>
              <div className="flex items-center gap-[0.7vw]">
                <div className="w-[0.4vw] h-[0.4vw] rounded-full bg-primary shrink-0" />
                <span className="text-[1.5vw] text-white/50">Expiry date management</span>
              </div>
            </div>
          </div>

          {/* Column 3: Wholesale */}
          <div
            className="flex flex-col p-[2.5vw] rounded-[1.2vw]"
            style={{
              background: "rgba(19,24,41,0.8)",
              border: "1px solid rgba(93,95,239,0.25)",
            }}
          >
            {/* Icon */}
            <div
              className="w-[4.5vw] h-[4.5vw] rounded-[0.8vw] mb-[2vh] flex items-center justify-center text-primary"
              style={{ background: "rgba(93,95,239,0.12)" }}
            >
              <svg className="w-[2.2vw] h-[2.2vw]" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 7h8M8 11h8M8 15h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-[2.2vw] font-bold mb-[1.5vh]">Wholesale &amp; B2B</p>
            <p className="text-[1.7vw] text-white/55 leading-[1.5]">
              Sales orders, invoices, purchase orders, and vendor credit management in one workflow
            </p>
            <div className="mt-[2.5vh] flex flex-col gap-[1.2vh]">
              <div className="flex items-center gap-[0.7vw]">
                <div className="w-[0.4vw] h-[0.4vw] rounded-full bg-primary shrink-0" />
                <span className="text-[1.5vw] text-white/50">Customer credit limits</span>
              </div>
              <div className="flex items-center gap-[0.7vw]">
                <div className="w-[0.4vw] h-[0.4vw] rounded-full bg-primary shrink-0" />
                <span className="text-[1.5vw] text-white/50">Purchase orders</span>
              </div>
              <div className="flex items-center gap-[0.7vw]">
                <div className="w-[0.4vw] h-[0.4vw] rounded-full bg-primary shrink-0" />
                <span className="text-[1.5vw] text-white/50">Invoicing and quoting</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-[3.5vh] left-[5vw] z-10 text-[0.9vw] text-white/20 tracking-[0.08em] uppercase">
        Ascend POS, Inc.
      </div>
      <div className="absolute bottom-[3.5vh] right-[5vw] z-10 text-[0.9vw] text-white/20">
        03 / 10
      </div>
    </div>
  );
}
