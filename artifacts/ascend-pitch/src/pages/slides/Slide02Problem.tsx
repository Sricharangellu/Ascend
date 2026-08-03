export default function Slide02Problem() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#0A0D17] font-display text-white">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50vw 40vh at 90% 80%, rgba(93,95,239,0.10) 0%, transparent 55%), radial-gradient(ellipse 40vw 35vh at 10% 15%, rgba(139,92,246,0.08) 0%, transparent 55%)",
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

      {/* Two-column content */}
      <div
        className="absolute z-10 flex gap-[5vw] items-center"
        style={{ top: "12vh", bottom: "11vh", left: "5vw", right: "5vw" }}
      >
        {/* Left: pain points */}
        <div className="flex flex-col justify-center gap-[3.5vh]" style={{ width: "42%" }}>
          <div>
            <span className="text-[1vw] font-semibold tracking-[0.12em] uppercase text-primary/80">
              The Problem
            </span>
            <h2 className="text-[3.5vw] font-extrabold tracking-tight leading-[1.1] mt-[1.5vh] text-balance">
              Specialty retail runs on duct tape
            </h2>
          </div>

          {/* Pain 1 */}
          <div className="flex gap-[1.2vw] items-start">
            <div
              className="shrink-0 w-[2.8vw] h-[2.8vw] rounded-[0.5vw] flex items-center justify-center text-[1vw] font-bold text-primary"
              style={{ background: "rgba(93,95,239,0.12)", border: "1px solid rgba(93,95,239,0.25)" }}
            >
              01
            </div>
            <div>
              <p className="text-[2vw] font-semibold mb-[0.6vh]">Disconnected Systems</p>
              <p className="text-[1.7vw] text-white/50 leading-[1.4]">
                POS, inventory, and accounting live in separate tools with no shared data
              </p>
            </div>
          </div>

          {/* Pain 2 */}
          <div className="flex gap-[1.2vw] items-start">
            <div
              className="shrink-0 w-[2.8vw] h-[2.8vw] rounded-[0.5vw] flex items-center justify-center text-[1vw] font-bold text-primary"
              style={{ background: "rgba(93,95,239,0.12)", border: "1px solid rgba(93,95,239,0.25)" }}
            >
              02
            </div>
            <div>
              <p className="text-[2vw] font-semibold mb-[0.6vh]">Compliance Exposure</p>
              <p className="text-[1.7vw] text-white/50 leading-[1.4]">
                Tobacco MSA, vapor excise, and hemp regulations change annually — general POS cannot keep pace
              </p>
            </div>
          </div>

          {/* Pain 3 */}
          <div className="flex gap-[1.2vw] items-start">
            <div
              className="shrink-0 w-[2.8vw] h-[2.8vw] rounded-[0.5vw] flex items-center justify-center text-[1vw] font-bold text-primary"
              style={{ background: "rgba(93,95,239,0.12)", border: "1px solid rgba(93,95,239,0.25)" }}
            >
              03
            </div>
            <div>
              <p className="text-[2vw] font-semibold mb-[0.6vh]">Wholesale in Spreadsheets</p>
              <p className="text-[1.7vw] text-white/50 leading-[1.4]">
                B2B orders, invoices, and purchase orders managed manually with no integration to inventory
              </p>
            </div>
          </div>
        </div>

        {/* Right: fragmented systems visual */}
        <div className="flex-1 relative flex items-center justify-center" style={{ height: "100%" }}>
          {/* Background tint */}
          <div
            className="absolute inset-0 rounded-[1.5vw]"
            style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}
          />

          {/* System card: POS */}
          <div
            className="absolute bg-[#131829] rounded-[0.8vw] p-[1.2vw]"
            style={{
              top: "8%",
              left: "5%",
              width: "40%",
              border: "1px solid rgba(255,100,100,0.2)",
              boxShadow: "0 0.5vh 2vh rgba(0,0,0,0.4)",
            }}
          >
            <div className="flex items-center gap-[0.6vw] mb-[1vh]">
              <div className="w-[1.2vw] h-[1.2vw] rounded-[0.25vw] bg-red-500/60" />
              <span className="text-[1.1vw] font-semibold text-white/70">POS System</span>
            </div>
            <div className="h-[0.5vw] w-full bg-white/6 rounded mb-[0.6vh]" />
            <div className="h-[0.5vw] w-4/5 bg-white/6 rounded" />
          </div>

          {/* System card: Inventory */}
          <div
            className="absolute bg-[#131829] rounded-[0.8vw] p-[1.2vw]"
            style={{
              top: "30%",
              right: "5%",
              width: "42%",
              border: "1px solid rgba(255,200,50,0.2)",
              boxShadow: "0 0.5vh 2vh rgba(0,0,0,0.4)",
            }}
          >
            <div className="flex items-center gap-[0.6vw] mb-[1vh]">
              <div className="w-[1.2vw] h-[1.2vw] rounded-[0.25vw] bg-yellow-500/60" />
              <span className="text-[1.1vw] font-semibold text-white/70">Inventory Tool</span>
            </div>
            <div className="h-[0.5vw] w-full bg-white/6 rounded mb-[0.6vh]" />
            <div className="h-[0.5vw] w-3/4 bg-white/6 rounded" />
          </div>

          {/* System card: Accounting */}
          <div
            className="absolute bg-[#131829] rounded-[0.8vw] p-[1.2vw]"
            style={{
              bottom: "8%",
              left: "12%",
              width: "40%",
              border: "1px solid rgba(100,200,255,0.2)",
              boxShadow: "0 0.5vh 2vh rgba(0,0,0,0.4)",
            }}
          >
            <div className="flex items-center gap-[0.6vw] mb-[1vh]">
              <div className="w-[1.2vw] h-[1.2vw] rounded-[0.25vw] bg-sky-500/60" />
              <span className="text-[1.1vw] font-semibold text-white/70">Accounting</span>
            </div>
            <div className="h-[0.5vw] w-full bg-white/6 rounded mb-[0.6vh]" />
            <div className="h-[0.5vw] w-2/3 bg-white/6 rounded" />
          </div>

          {/* Disconnected label */}
          <div
            className="absolute text-[1vw] font-semibold text-red-400/60 text-center"
            style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}
          >
            No shared data
          </div>

          {/* X marks */}
          <div
            className="absolute text-[1.8vw] text-red-400/40"
            style={{ top: "48%", left: "30%" }}
          >
            &#x2715;
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-[3.5vh] left-[5vw] z-10 text-[0.9vw] text-white/20 tracking-[0.08em] uppercase">
        Ascend POS, Inc.
      </div>
      <div className="absolute bottom-[3.5vh] right-[5vw] z-10 text-[0.9vw] text-white/20">
        02 / 10
      </div>
    </div>
  );
}
