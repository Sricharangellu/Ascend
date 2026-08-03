export default function Slide09Pricing() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#0A0D17] font-display text-white">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50vw 45vh at 50% 10%, rgba(93,95,239,0.12) 0%, transparent 55%), radial-gradient(ellipse 35vw 30vh at 5% 90%, rgba(139,92,246,0.08) 0%, transparent 55%)",
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
        style={{ top: "12vh", bottom: "11vh", left: "5vw", right: "5vw" }}
      >
        {/* Header */}
        <div className="mb-[3.5vh]">
          <span className="text-[1vw] font-semibold tracking-[0.12em] uppercase text-primary/80">
            Pricing
          </span>
          <h2 className="text-[3.5vw] font-extrabold tracking-tight leading-[1.1] mt-[1.5vh]">
            Per-location SaaS pricing
          </h2>
        </div>

        {/* Three tier cards */}
        <div className="flex-1 grid grid-cols-3 gap-[2vw]">
          {/* Tier 1: Starter */}
          <div
            className="flex flex-col p-[2.2vw] rounded-[1.2vw]"
            style={{
              background: "rgba(19,24,41,0.8)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <p className="text-[1.5vw] font-semibold text-white/50 uppercase tracking-[0.08em] mb-[1.5vh]">
              Starter
            </p>
            <p className="text-[2.5vw] font-extrabold mb-[0.5vh]">Single location</p>
            <p className="text-[1.6vw] text-white/40 mb-[2.5vh]">Best for independent stores</p>
            <div
              className="h-[0.1vh] w-full mb-[2.5vh]"
              style={{ background: "rgba(255,255,255,0.08)" }}
            />
            <div className="flex flex-col gap-[1.5vh]">
              <div className="flex items-center gap-[0.7vw]">
                <svg className="w-[1.2vw] h-[1.2vw] text-white/40 shrink-0" viewBox="0 0 20 20" fill="none">
                  <polyline points="4,10 8,14 16,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[1.6vw] text-white/60">POS terminal</span>
              </div>
              <div className="flex items-center gap-[0.7vw]">
                <svg className="w-[1.2vw] h-[1.2vw] text-white/40 shrink-0" viewBox="0 0 20 20" fill="none">
                  <polyline points="4,10 8,14 16,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[1.6vw] text-white/60">Inventory control</span>
              </div>
              <div className="flex items-center gap-[0.7vw]">
                <svg className="w-[1.2vw] h-[1.2vw] text-white/40 shrink-0" viewBox="0 0 20 20" fill="none">
                  <polyline points="4,10 8,14 16,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[1.6vw] text-white/60">Sales reporting</span>
              </div>
              <div className="flex items-center gap-[0.7vw]">
                <svg className="w-[1.2vw] h-[1.2vw] text-white/40 shrink-0" viewBox="0 0 20 20" fill="none">
                  <polyline points="4,10 8,14 16,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[1.6vw] text-white/60">Customer loyalty</span>
              </div>
            </div>
          </div>

          {/* Tier 2: Growth — highlighted */}
          <div
            className="flex flex-col p-[2.2vw] rounded-[1.2vw] relative"
            style={{
              background: "rgba(93,95,239,0.12)",
              border: "1px solid rgba(93,95,239,0.4)",
            }}
          >
            {/* Most popular badge */}
            <div
              className="absolute top-[-1.5vh] left-1/2 px-[1.2vw] py-[0.4vh] rounded-full text-[1vw] font-semibold text-white"
              style={{
                transform: "translateX(-50%)",
                background: "linear-gradient(135deg, #5D5FEF 0%, #8B5CF6 100%)",
              }}
            >
              Most popular
            </div>
            <p className="text-[1.5vw] font-semibold text-primary uppercase tracking-[0.08em] mb-[1.5vh]">
              Growth
            </p>
            <p className="text-[2.5vw] font-extrabold mb-[0.5vh]">Up to 10 locations</p>
            <p className="text-[1.6vw] text-white/55 mb-[2.5vh]">For regional chains</p>
            <div
              className="h-[0.1vh] w-full mb-[2.5vh]"
              style={{ background: "rgba(93,95,239,0.3)" }}
            />
            <div className="flex flex-col gap-[1.5vh]">
              <div className="flex items-center gap-[0.7vw]">
                <svg className="w-[1.2vw] h-[1.2vw] text-primary shrink-0" viewBox="0 0 20 20" fill="none">
                  <polyline points="4,10 8,14 16,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[1.6vw] text-white/75">Everything in Starter</span>
              </div>
              <div className="flex items-center gap-[0.7vw]">
                <svg className="w-[1.2vw] h-[1.2vw] text-primary shrink-0" viewBox="0 0 20 20" fill="none">
                  <polyline points="4,10 8,14 16,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[1.6vw] text-white/75">Wholesale &amp; B2B</span>
              </div>
              <div className="flex items-center gap-[0.7vw]">
                <svg className="w-[1.2vw] h-[1.2vw] text-primary shrink-0" viewBox="0 0 20 20" fill="none">
                  <polyline points="4,10 8,14 16,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[1.6vw] text-white/75">Compliance reporting</span>
              </div>
              <div className="flex items-center gap-[0.7vw]">
                <svg className="w-[1.2vw] h-[1.2vw] text-primary shrink-0" viewBox="0 0 20 20" fill="none">
                  <polyline points="4,10 8,14 16,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[1.6vw] text-white/75">Multi-location transfers</span>
              </div>
            </div>
          </div>

          {/* Tier 3: Enterprise */}
          <div
            className="flex flex-col p-[2.2vw] rounded-[1.2vw]"
            style={{
              background: "rgba(19,24,41,0.8)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <p className="text-[1.5vw] font-semibold text-white/50 uppercase tracking-[0.08em] mb-[1.5vh]">
              Enterprise
            </p>
            <p className="text-[2.5vw] font-extrabold mb-[0.5vh]">Unlimited locations</p>
            <p className="text-[1.6vw] text-white/40 mb-[2.5vh]">For large operators</p>
            <div
              className="h-[0.1vh] w-full mb-[2.5vh]"
              style={{ background: "rgba(255,255,255,0.08)" }}
            />
            <div className="flex flex-col gap-[1.5vh]">
              <div className="flex items-center gap-[0.7vw]">
                <svg className="w-[1.2vw] h-[1.2vw] text-white/40 shrink-0" viewBox="0 0 20 20" fill="none">
                  <polyline points="4,10 8,14 16,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[1.6vw] text-white/60">Everything in Growth</span>
              </div>
              <div className="flex items-center gap-[0.7vw]">
                <svg className="w-[1.2vw] h-[1.2vw] text-white/40 shrink-0" viewBox="0 0 20 20" fill="none">
                  <polyline points="4,10 8,14 16,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[1.6vw] text-white/60">Custom integrations</span>
              </div>
              <div className="flex items-center gap-[0.7vw]">
                <svg className="w-[1.2vw] h-[1.2vw] text-white/40 shrink-0" viewBox="0 0 20 20" fill="none">
                  <polyline points="4,10 8,14 16,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[1.6vw] text-white/60">Dedicated support</span>
              </div>
              <div className="flex items-center gap-[0.7vw]">
                <svg className="w-[1.2vw] h-[1.2vw] text-white/40 shrink-0" viewBox="0 0 20 20" fill="none">
                  <polyline points="4,10 8,14 16,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[1.6vw] text-white/60">SLA guarantee</span>
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
        09 / 10
      </div>
    </div>
  );
}
