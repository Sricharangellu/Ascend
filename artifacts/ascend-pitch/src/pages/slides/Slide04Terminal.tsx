export default function Slide04Terminal() {
  return (
    <div className="w-screen h-screen overflow-hidden relative bg-[#0A0D17] font-display text-white">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 45vw 40vh at 90% 50%, rgba(93,95,239,0.12) 0%, transparent 55%), radial-gradient(ellipse 35vw 30vh at 5% 15%, rgba(139,92,246,0.08) 0%, transparent 55%)",
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
        {/* Left: Text */}
        <div className="flex flex-col justify-center gap-[3vh]" style={{ width: "42%" }}>
          <span className="text-[1vw] font-semibold tracking-[0.12em] uppercase text-primary/80">
            Product
          </span>
          <h2 className="text-[3.5vw] font-extrabold tracking-tight leading-[1.1] text-balance">
            Built for high-volume checkout
          </h2>
          <p className="text-[1.9vw] text-white/55 leading-[1.5] text-balance">
            The Ascend terminal handles a full retail shift with no slowdowns, no dropped sales, and no dependency on an internet connection.
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
                <p className="text-[1.9vw] font-semibold">Barcode and manual product lookup</p>
                <p className="text-[1.65vw] text-white/45 mt-[0.4vh] leading-[1.4]">
                  Scan or search — any product, any variant, instant add-to-cart
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
                <p className="text-[1.9vw] font-semibold">Offline mode with automatic sync</p>
                <p className="text-[1.65vw] text-white/45 mt-[0.4vh] leading-[1.4]">
                  Transactions queue locally and sync the moment connectivity returns
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
                <p className="text-[1.9vw] font-semibold">Split tender and gift cards</p>
                <p className="text-[1.65vw] text-white/45 mt-[0.4vh] leading-[1.4]">
                  Cash, card, gift card, and store credit on a single transaction
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Terminal UI mockup */}
        <div className="flex-1 flex items-center justify-center" style={{ height: "100%" }}>
          <div
            className="w-full rounded-[1.2vw] overflow-hidden"
            style={{
              height: "85%",
              background: "#0F1220",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 2vh 5vh rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            {/* Mock top bar */}
            <div
              className="flex items-center gap-[0.5vw] px-[1.5vw] py-[1.2vh]"
              style={{ background: "#131829", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="w-[0.7vw] h-[0.7vw] rounded-full bg-red-400/70" />
              <div className="w-[0.7vw] h-[0.7vw] rounded-full bg-yellow-400/70" />
              <div className="w-[0.7vw] h-[0.7vw] rounded-full bg-green-400/70" />
              <div
                className="ml-[1vw] flex-1 h-[2.5vh] rounded text-[1.1vw] text-white/30 flex items-center px-[0.8vw]"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                Ascend Terminal
              </div>
            </div>

            {/* Cart items area */}
            <div className="p-[1.5vw] flex flex-col gap-[1.2vh]" style={{ height: "55%" }}>
              <p className="text-[1.1vw] font-semibold text-white/50 uppercase tracking-[0.08em] mb-[0.5vh]">Cart</p>

              {/* Cart item 1 */}
              <div
                className="flex items-center gap-[1vw] px-[1vw] py-[1vh] rounded-[0.6vw]"
                style={{ background: "rgba(93,95,239,0.08)", border: "1px solid rgba(93,95,239,0.18)" }}
              >
                <div className="w-[2vw] h-[2vw] rounded-[0.4vw] bg-primary/40 shrink-0" />
                <div className="flex-1">
                  <div className="h-[0.7vw] w-[60%] bg-white/25 rounded" />
                  <div className="h-[0.5vw] w-[35%] bg-white/12 rounded mt-[0.4vh]" />
                </div>
                <div className="text-[1.3vw] font-bold text-white">$12.99</div>
              </div>

              {/* Cart item 2 */}
              <div
                className="flex items-center gap-[1vw] px-[1vw] py-[1vh] rounded-[0.6vw]"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="w-[2vw] h-[2vw] rounded-[0.4vw] bg-white/10 shrink-0" />
                <div className="flex-1">
                  <div className="h-[0.7vw] w-[50%] bg-white/20 rounded" />
                  <div className="h-[0.5vw] w-[30%] bg-white/10 rounded mt-[0.4vh]" />
                </div>
                <div className="text-[1.3vw] font-bold text-white">$24.00</div>
              </div>

              {/* Cart item 3 */}
              <div
                className="flex items-center gap-[1vw] px-[1vw] py-[1vh] rounded-[0.6vw]"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="w-[2vw] h-[2vw] rounded-[0.4vw] bg-white/10 shrink-0" />
                <div className="flex-1">
                  <div className="h-[0.7vw] w-[45%] bg-white/20 rounded" />
                  <div className="h-[0.5vw] w-[28%] bg-white/10 rounded mt-[0.4vh]" />
                </div>
                <div className="text-[1.3vw] font-bold text-white">$8.50</div>
              </div>
            </div>

            {/* Total area */}
            <div
              className="px-[1.5vw] py-[1.5vh] flex flex-col gap-[1vh]"
              style={{ background: "#131829", borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex justify-between text-[1.2vw] text-white/50">
                <span>Subtotal</span>
                <span>$45.49</span>
              </div>
              <div className="flex justify-between text-[1.2vw] text-white/50">
                <span>Tax (8.5%)</span>
                <span>$3.87</span>
              </div>
              <div className="flex justify-between text-[1.5vw] font-bold text-white mt-[0.5vh]">
                <span>Total</span>
                <span className="text-primary">$49.36</span>
              </div>

              {/* Charge button mock */}
              <div
                className="w-full py-[1.2vh] rounded-[0.6vw] flex items-center justify-center text-[1.2vw] font-bold text-white mt-[0.5vh]"
                style={{ background: "linear-gradient(135deg, #5D5FEF 0%, #8B5CF6 100%)" }}
              >
                Charge $49.36
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
        04 / 10
      </div>
    </div>
  );
}
