export default function Slide08Metrics() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#0A0D17] font-display text-white">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 65vw 55vh at 50% 50%, rgba(93,95,239,0.13) 0%, transparent 55%), radial-gradient(ellipse 35vw 30vh at 5% 90%, rgba(139,92,246,0.09) 0%, transparent 55%)",
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
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
        {/* Header */}
        <span className="text-[1vw] font-semibold tracking-[0.12em] uppercase text-primary/80 mb-[2vh]">
          Traction
        </span>
        <h2 className="text-[3.5vw] font-extrabold tracking-tight mb-[6vh] text-center">
          Built to scale
        </h2>

        {/* Three stats */}
        <div
          className="flex w-[80vw]"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          {/* Stat 1 */}
          <div
            className="flex-1 flex flex-col items-center py-[5vh] px-[3vw]"
            style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="text-[9vw] font-extrabold tracking-[-0.04em] leading-none text-white">
              2,400<span className="text-primary">+</span>
            </div>
            <div className="text-[1.8vw] font-semibold text-white/70 mt-[2.5vh]">Organizations</div>
            <div className="text-[1.5vw] text-white/35 mt-[0.8vh]">Actively billing</div>
          </div>

          {/* Stat 2 */}
          <div
            className="flex-1 flex flex-col items-center py-[5vh] px-[3vw]"
            style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="text-[9vw] font-extrabold tracking-[-0.04em] leading-none text-white">
              50M<span className="text-primary">+</span>
            </div>
            <div className="text-[1.8vw] font-semibold text-white/70 mt-[2.5vh]">Transactions / mo</div>
            <div className="text-[1.5vw] text-white/35 mt-[0.8vh]">Across all tenants</div>
          </div>

          {/* Stat 3 */}
          <div className="flex-1 flex flex-col items-center py-[5vh] px-[3vw]">
            <div className="text-[9vw] font-extrabold tracking-[-0.04em] leading-none text-white">
              99.99<span className="text-primary">%</span>
            </div>
            <div className="text-[1.8vw] font-semibold text-white/70 mt-[2.5vh]">Uptime SLA</div>
            <div className="text-[1.5vw] text-white/35 mt-[0.8vh]">Global regions</div>
          </div>
        </div>

        {/* Supporting note */}
        <p className="text-[1.5vw] text-white/30 mt-[3.5vh] text-center">
          Production metrics as of 2026
        </p>
      </div>

      {/* Footer */}
      <div className="absolute bottom-[3.5vh] left-[5vw] z-10 text-[0.9vw] text-white/20 tracking-[0.08em] uppercase">
        Ascend POS, Inc.
      </div>
      <div className="absolute bottom-[3.5vh] right-[5vw] z-10 text-[0.9vw] text-white/20">
        08 / 10
      </div>
    </div>
  );
}
