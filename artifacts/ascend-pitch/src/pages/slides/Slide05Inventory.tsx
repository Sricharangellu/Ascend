export default function Slide05Inventory() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#0A0D17] font-display text-white">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 45vw 40vh at 5% 50%, rgba(93,95,239,0.12) 0%, transparent 55%), radial-gradient(ellipse 35vw 30vh at 90% 15%, rgba(139,92,246,0.08) 0%, transparent 55%)",
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

      {/* Two-column layout — mockup LEFT, text RIGHT */}
      <div
        className="absolute z-10 flex gap-[5vw] items-center"
        style={{ top: "12vh", bottom: "11vh", left: "5vw", right: "5vw" }}
      >
        {/* Left: Inventory table mockup */}
        <div className="flex items-center justify-center" style={{ width: "52%", height: "100%" }}>
          <div
            className="w-full rounded-[1.2vw] overflow-hidden"
            style={{
              height: "88%",
              background: "#0F1220",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 2vh 5vh rgba(0,0,0,0.6)",
            }}
          >
            {/* Header bar */}
            <div
              className="flex items-center justify-between px-[1.5vw] py-[1.2vh]"
              style={{ background: "#131829", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span className="text-[1.1vw] font-semibold text-white/70">Inventory — All Locations</span>
              <div
                className="px-[0.8vw] py-[0.3vh] rounded text-[0.9vw] text-primary font-medium"
                style={{ background: "rgba(93,95,239,0.12)" }}
              >
                3 Locations
              </div>
            </div>

            {/* Table header */}
            <div
              className="grid px-[1.5vw] py-[0.9vh] text-[1vw] text-white/35 font-medium uppercase tracking-[0.06em]"
              style={{ gridTemplateColumns: "3fr 2fr 1.5fr 1.5fr", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
            >
              <span>Product</span>
              <span>SKU</span>
              <span>On Hand</span>
              <span>Status</span>
            </div>

            {/* Row 1 */}
            <div
              className="grid px-[1.5vw] py-[1.1vh] items-center text-[1.1vw]"
              style={{ gridTemplateColumns: "3fr 2fr 1.5fr 1.5fr", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
            >
              <div className="flex items-center gap-[0.7vw]">
                <div className="w-[1.8vw] h-[1.8vw] rounded-[0.35vw] bg-primary/30 shrink-0" />
                <span className="text-white/80">Marlboro Gold 20pk</span>
              </div>
              <span className="text-white/40 font-mono">MBG-020-200</span>
              <span className="text-white/80 font-semibold">142</span>
              <span
                className="text-[0.95vw] font-semibold px-[0.6vw] py-[0.2vh] rounded w-fit"
                style={{ background: "rgba(34,197,94,0.12)", color: "rgb(134,239,172)" }}
              >
                In stock
              </span>
            </div>

            {/* Row 2 */}
            <div
              className="grid px-[1.5vw] py-[1.1vh] items-center text-[1.1vw]"
              style={{ gridTemplateColumns: "3fr 2fr 1.5fr 1.5fr", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
            >
              <div className="flex items-center gap-[0.7vw]">
                <div className="w-[1.8vw] h-[1.8vw] rounded-[0.35vw] bg-accent/30 shrink-0" />
                <span className="text-white/80">Elf Bar BC5000 — Mango</span>
              </div>
              <span className="text-white/40 font-mono">ELF-5K-MNG</span>
              <span className="text-yellow-300/90 font-semibold">18</span>
              <span
                className="text-[0.95vw] font-semibold px-[0.6vw] py-[0.2vh] rounded w-fit"
                style={{ background: "rgba(234,179,8,0.12)", color: "rgb(253,224,71)" }}
              >
                Low stock
              </span>
            </div>

            {/* Row 3 */}
            <div
              className="grid px-[1.5vw] py-[1.1vh] items-center text-[1.1vw]"
              style={{ gridTemplateColumns: "3fr 2fr 1.5fr 1.5fr", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
            >
              <div className="flex items-center gap-[0.7vw]">
                <div className="w-[1.8vw] h-[1.8vw] rounded-[0.35vw] bg-white/10 shrink-0" />
                <span className="text-white/80">Delta-8 Gummies 25mg</span>
              </div>
              <span className="text-white/40 font-mono">D8G-25MG-30</span>
              <span className="text-white/80 font-semibold">87</span>
              <span
                className="text-[0.95vw] font-semibold px-[0.6vw] py-[0.2vh] rounded w-fit"
                style={{ background: "rgba(34,197,94,0.12)", color: "rgb(134,239,172)" }}
              >
                In stock
              </span>
            </div>

            {/* Row 4 */}
            <div
              className="grid px-[1.5vw] py-[1.1vh] items-center text-[1.1vw]"
              style={{ gridTemplateColumns: "3fr 2fr 1.5fr 1.5fr", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
            >
              <div className="flex items-center gap-[0.7vw]">
                <div className="w-[1.8vw] h-[1.8vw] rounded-[0.35vw] bg-red-500/20 shrink-0" />
                <span className="text-white/80">CBD Oil 1500mg 30ml</span>
              </div>
              <span className="text-white/40 font-mono">CBD-1500-30</span>
              <span className="text-red-400/90 font-semibold">0</span>
              <span
                className="text-[0.95vw] font-semibold px-[0.6vw] py-[0.2vh] rounded w-fit"
                style={{ background: "rgba(239,68,68,0.12)", color: "rgb(252,165,165)" }}
              >
                Out of stock
              </span>
            </div>

            {/* Row 5 */}
            <div
              className="grid px-[1.5vw] py-[1.1vh] items-center text-[1.1vw]"
              style={{ gridTemplateColumns: "3fr 2fr 1.5fr 1.5fr" }}
            >
              <div className="flex items-center gap-[0.7vw]">
                <div className="w-[1.8vw] h-[1.8vw] rounded-[0.35vw] bg-white/10 shrink-0" />
                <span className="text-white/80">Torch THC Disposable</span>
              </div>
              <span className="text-white/40 font-mono">TCH-DISP-2G</span>
              <span className="text-white/80 font-semibold">204</span>
              <span
                className="text-[0.95vw] font-semibold px-[0.6vw] py-[0.2vh] rounded w-fit"
                style={{ background: "rgba(34,197,94,0.12)", color: "rgb(134,239,172)" }}
              >
                In stock
              </span>
            </div>
          </div>
        </div>

        {/* Right: Text */}
        <div className="flex flex-col justify-center gap-[3vh]" style={{ width: "43%" }}>
          <span className="text-[1vw] font-semibold tracking-[0.12em] uppercase text-primary/80">
            Product
          </span>
          <h2 className="text-[3.5vw] font-extrabold tracking-tight leading-[1.1] text-balance">
            Inventory that reflects reality
          </h2>
          <p className="text-[1.9vw] text-white/55 leading-[1.5] text-balance">
            Real-time stock across every location, with the batch and expiry tracking that regulated products demand.
          </p>

          {/* Features */}
          <div className="flex flex-col gap-[2.5vh] mt-[1vh]">
            <div className="flex gap-[1.2vw] items-start">
              <div
                className="shrink-0 w-[2.6vw] h-[2.6vw] rounded-[0.5vw] flex items-center justify-center text-primary mt-[0.3vh]"
                style={{ background: "rgba(93,95,239,0.12)", border: "1px solid rgba(93,95,239,0.2)" }}
              >
                <svg className="w-[1.3vw] h-[1.3vw]" viewBox="0 0 20 20" fill="none">
                  <polyline points="4,10 8,14 16,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="text-[1.9vw] font-semibold">Multi-location visibility</p>
                <p className="text-[1.65vw] text-white/45 mt-[0.4vh] leading-[1.4]">
                  Unified stock view across all outlets with per-location detail
                </p>
              </div>
            </div>

            <div className="flex gap-[1.2vw] items-start">
              <div
                className="shrink-0 w-[2.6vw] h-[2.6vw] rounded-[0.5vw] flex items-center justify-center text-primary mt-[0.3vh]"
                style={{ background: "rgba(93,95,239,0.12)", border: "1px solid rgba(93,95,239,0.2)" }}
              >
                <svg className="w-[1.3vw] h-[1.3vw]" viewBox="0 0 20 20" fill="none">
                  <polyline points="4,10 8,14 16,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="text-[1.9vw] font-semibold">Batch and lot tracking</p>
                <p className="text-[1.65vw] text-white/45 mt-[0.4vh] leading-[1.4]">
                  Trace product batches from receipt through sale, with expiry date alerts
                </p>
              </div>
            </div>

            <div className="flex gap-[1.2vw] items-start">
              <div
                className="shrink-0 w-[2.6vw] h-[2.6vw] rounded-[0.5vw] flex items-center justify-center text-primary mt-[0.3vh]"
                style={{ background: "rgba(93,95,239,0.12)", border: "1px solid rgba(93,95,239,0.2)" }}
              >
                <svg className="w-[1.3vw] h-[1.3vw]" viewBox="0 0 20 20" fill="none">
                  <polyline points="4,10 8,14 16,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="text-[1.9vw] font-semibold">Automated reorder alerts</p>
                <p className="text-[1.65vw] text-white/45 mt-[0.4vh] leading-[1.4]">
                  Set reorder thresholds per SKU — never miss a low-stock situation
                </p>
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
        05 / 10
      </div>
    </div>
  );
}
