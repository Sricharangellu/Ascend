export default function Slide10Closing() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#0A0D17] font-display text-white">
      {/* Stronger glow for closing */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70vw 60vh at 50% 45%, rgba(93,95,239,0.18) 0%, transparent 55%), radial-gradient(ellipse 40vw 35vh at 5% 90%, rgba(139,92,246,0.12) 0%, transparent 55%)",
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

      {/* Centered content */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
        {/* Large wordmark */}
        <div className="flex items-center gap-[1.5vw] mb-[3vh]">
          <div
            className="w-[5vw] h-[5vw] bg-primary rounded-[1vw] flex items-center justify-center"
            style={{ boxShadow: "0 1vh 3vh rgba(93,95,239,0.4)" }}
          >
            <svg className="w-[2.5vw] h-[2.5vw] text-white" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-[6vw] font-extrabold tracking-[-0.04em] leading-none">
            Asc<span className="text-primary">end</span>
          </h1>
        </div>

        {/* Tagline */}
        <p className="text-[2.2vw] text-white/55 text-center mb-[5vh] text-balance" style={{ maxWidth: "52vw" }}>
          Enterprise POS for Retail, Wholesale &amp; Distribution
        </p>

        {/* Divider */}
        <div
          className="mb-[5vh]"
          style={{ width: "8vw", height: "0.15vh", background: "rgba(93,95,239,0.5)" }}
        />

        {/* Contact row */}
        <div className="flex items-center gap-[4vw]">
          <div className="text-center">
            <p className="text-[1.2vw] text-white/35 uppercase tracking-[0.08em] mb-[0.8vh]">Website</p>
            <p className="text-[1.8vw] font-semibold text-white/75">ascend.dev</p>
          </div>
          <div
            className="w-[0.1vw] h-[5vh]"
            style={{ background: "rgba(255,255,255,0.1)" }}
          />
          <div className="text-center">
            <p className="text-[1.2vw] text-white/35 uppercase tracking-[0.08em] mb-[0.8vh]">Demo</p>
            <p className="text-[1.8vw] font-semibold text-white/75">ascend.dev/login?demo=1</p>
          </div>
          <div
            className="w-[0.1vw] h-[5vh]"
            style={{ background: "rgba(255,255,255,0.1)" }}
          />
          <div className="text-center">
            <p className="text-[1.2vw] text-white/35 uppercase tracking-[0.08em] mb-[0.8vh]">Platform</p>
            <p className="text-[1.8vw] font-semibold text-white/75">Multi-tenant SaaS</p>
          </div>
        </div>
      </div>

      {/* Corner accent */}
      <div
        className="absolute bottom-0 right-0 w-[30vw] h-[30vw] rounded-tl-full opacity-[0.04]"
        style={{ background: "#5D5FEF" }}
      />

      {/* Footer */}
      <div className="absolute bottom-[3.5vh] left-[5vw] z-10 text-[0.9vw] text-white/20 tracking-[0.08em] uppercase">
        Ascend POS, Inc.
      </div>
      <div className="absolute bottom-[3.5vh] right-[5vw] z-10 text-[0.9vw] text-white/20">
        10 / 10
      </div>
    </div>
  );
}
