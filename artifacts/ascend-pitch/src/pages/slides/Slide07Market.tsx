export default function Slide07Market() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#0A0D17] font-display text-white">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55vw 50vh at 60% 50%, rgba(93,95,239,0.10) 0%, transparent 55%), radial-gradient(ellipse 35vw 30vh at 5% 10%, rgba(139,92,246,0.09) 0%, transparent 55%)",
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

      {/* Two-column layout */}
      <div
        className="absolute z-10 flex gap-[5vw] items-center"
        style={{ top: "12vh", bottom: "11vh", left: "5vw", right: "5vw" }}
      >
        {/* Left: market framing */}
        <div className="flex flex-col justify-center gap-[3vh]" style={{ width: "44%" }}>
          <span className="text-[1vw] font-semibold tracking-[0.12em] uppercase text-primary/80">
            Market
          </span>
          <h2 className="text-[3.5vw] font-extrabold tracking-tight leading-[1.1] text-balance">
            A concentrated, regulated vertical
          </h2>
          <p className="text-[1.9vw] text-white/55 leading-[1.5]">
            Specialty retail — tobacco, vapor, hemp, and cannabis-adjacent products — operates under stricter compliance requirements than general retail.
          </p>
          <p className="text-[1.9vw] text-white/55 leading-[1.5]">
            Most operators still run on patchwork systems. Purpose-built software commands higher retention and lower churn in regulated verticals.
          </p>

          {/* Accent line */}
          <div className="flex items-center gap-[1vw] mt-[1vh]">
            <div className="h-[0.15vh] flex-1 bg-primary/30" />
            <span className="text-[1.3vw] text-primary/60 font-medium">No dominant platform yet</span>
          </div>
        </div>

        {/* Right: 3 characteristic cards */}
        <div className="flex-1 flex flex-col gap-[2vh]">
          {/* Card 1 */}
          <div
            className="flex gap-[1.5vw] p-[1.8vw] rounded-[1vw]"
            style={{ background: "rgba(19,24,41,0.8)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div
              className="shrink-0 w-[3vw] h-[3vw] rounded-[0.6vw] flex items-center justify-center text-primary"
              style={{ background: "rgba(93,95,239,0.12)" }}
            >
              <svg className="w-[1.5vw] h-[1.5vw]" viewBox="0 0 24 24" fill="none">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-[1.9vw] font-bold mb-[0.5vh]">Heavily Regulated</p>
              <p className="text-[1.6vw] text-white/50 leading-[1.4]">
                Tobacco MSA, vapor excise, and hemp labeling requirements change annually — general POS systems fall short
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div
            className="flex gap-[1.5vw] p-[1.8vw] rounded-[1vw]"
            style={{ background: "rgba(19,24,41,0.8)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div
              className="shrink-0 w-[3vw] h-[3vw] rounded-[0.6vw] flex items-center justify-center text-primary"
              style={{ background: "rgba(93,95,239,0.12)" }}
            >
              <svg className="w-[1.5vw] h-[1.5vw]" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </div>
            <div>
              <p className="text-[1.9vw] font-bold mb-[0.5vh]">Operationally Fragmented</p>
              <p className="text-[1.6vw] text-white/50 leading-[1.4]">
                Most operators juggle separate POS, inventory, accounting, and B2B tools with no shared data layer
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div
            className="flex gap-[1.5vw] p-[1.8vw] rounded-[1vw]"
            style={{ background: "rgba(19,24,41,0.8)", border: "1px solid rgba(93,95,239,0.2)" }}
          >
            <div
              className="shrink-0 w-[3vw] h-[3vw] rounded-[0.6vw] flex items-center justify-center text-primary"
              style={{ background: "rgba(93,95,239,0.15)" }}
            >
              <svg className="w-[1.5vw] h-[1.5vw]" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-[1.9vw] font-bold mb-[0.5vh] text-primary">Underserved by Software</p>
              <p className="text-[1.6vw] text-white/55 leading-[1.4]">
                No dominant purpose-built platform serves this vertical at scale — Ascend is designed to own it
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
        07 / 10
      </div>
    </div>
  );
}
