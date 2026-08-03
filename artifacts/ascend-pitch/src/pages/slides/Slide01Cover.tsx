export default function Slide01Cover() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#0A0D17] font-display text-white">
      {/* Background atmosphere */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60vw 50vh at 82% 5%, rgba(93,95,239,0.16) 0%, transparent 55%), radial-gradient(ellipse 50vw 40vh at 5% 90%, rgba(139,92,246,0.11) 0%, transparent 55%)",
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

      {/* Center content */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
        {/* Badge */}
        <div className="flex items-center gap-[0.6vw] px-[1.4vw] py-[0.6vh] rounded-full border border-primary/30 bg-primary/10 text-primary text-[1vw] font-semibold mb-[3.5vh]">
          <div className="w-[0.5vw] h-[0.5vw] rounded-full bg-primary" />
          Enterprise Retail Platform
        </div>

        {/* Wordmark */}
        <h1
          className="text-[7.5vw] font-extrabold tracking-[-0.04em] leading-none mb-[2.5vh] text-center text-balance"
        >
          Asc<span className="text-primary">end</span>
        </h1>

        {/* Subtitle */}
        <p className="text-[2vw] text-white/55 max-w-[50vw] text-center leading-[1.5] mb-[5vh] text-balance">
          End-to-end operations software for tobacco, vapor, hemp, and specialty retail
        </p>

        {/* Feature pills */}
        <div className="flex gap-[1.5vw]">
          <div className="px-[1.5vw] py-[0.8vh] rounded-full bg-white/5 border border-white/10 text-[1.1vw] text-white/65">
            Multi-location
          </div>
          <div className="px-[1.5vw] py-[0.8vh] rounded-full bg-white/5 border border-white/10 text-[1.1vw] text-white/65">
            Compliance-ready
          </div>
          <div className="px-[1.5vw] py-[0.8vh] rounded-full bg-white/5 border border-white/10 text-[1.1vw] text-white/65">
            Offline-capable
          </div>
        </div>
      </div>

      {/* Decorative UI panel — bottom right */}
      <div
        className="absolute z-10 bg-[#131829] border border-white/10 rounded-[1vw] p-[1.5vw] opacity-70"
        style={{
          bottom: "8vh",
          right: "-1vw",
          width: "22vw",
          height: "15vh",
          transform: "rotate(-5deg)",
          boxShadow: "0 2vh 4vh rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex items-center gap-[0.6vw] mb-[1.5vh]">
          <div className="w-[1.4vw] h-[1.4vw] rounded-[0.3vw] bg-primary/80" />
          <div className="h-[0.7vw] w-[7vw] rounded bg-white/10" />
          <div className="ml-auto h-[0.7vw] w-[2.5vw] rounded bg-primary/25" />
        </div>
        <div className="h-[0.6vw] w-full bg-white/6 rounded mb-[1vh]" />
        <div className="h-[0.6vw] w-4/5 bg-white/6 rounded mb-[1vh]" />
        <div className="h-[0.6vw] w-11/12 bg-white/6 rounded" />
      </div>

      {/* Second decorative card */}
      <div
        className="absolute z-10 bg-[#131829] border border-white/8 rounded-[0.8vw] p-[1.2vw] opacity-45"
        style={{
          bottom: "14vh",
          right: "17vw",
          width: "14vw",
          height: "9vh",
          transform: "rotate(3deg)",
        }}
      >
        <div className="h-[0.6vw] w-3/4 bg-white/10 rounded mb-[1vh]" />
        <div className="flex gap-[0.6vw]">
          <div className="flex-1 h-[4vh] rounded-[0.4vw] bg-primary/15 border border-primary/20" />
          <div className="flex-1 h-[4vh] rounded-[0.4vw] bg-white/3 border border-white/8" />
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-[3.5vh] left-[5vw] z-10 text-[0.9vw] text-white/20 tracking-[0.08em] uppercase">
        Ascend POS, Inc.
      </div>
      <div className="absolute bottom-[3.5vh] right-[5vw] z-10 text-[0.9vw] text-white/20">
        01 / 10
      </div>
    </div>
  );
}
