import { useLocation } from "wouter";
import { MotoLogoFull } from "@/components/MotoLogo";

export default function ThankYouPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8"
      style={{ background: "linear-gradient(160deg, #002639 0%, #004363 60%, #003552 100%)" }}>

      <div className="text-center animate-in" style={{ maxWidth: 480 }}>
        {/* Checkmark animation */}
        <div className="mx-auto mb-8 w-20 h-20 rounded-full flex items-center justify-center pulse-glow"
          style={{ background: "rgba(173,240,41,0.15)", border: "2px solid var(--gelbgrun)" }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--gelbgrun)" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>

        <MotoLogoFull height={36} className="mx-auto mb-6" />

        <h1 style={{ fontSize: 26, fontWeight: 900, color: "white", marginBottom: 12 }}>
          You're All Set!
        </h1>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, marginBottom: 8 }}>
          Your intake form and documents have been received. Your Motosaic advisor will review everything and reach out within 24 hours.
        </p>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 40 }}>
          Sit back — we'll handle the research, negotiation, and everything else.
        </p>

        <div className="rounded-2xl p-6 mb-8" style={{ background: "rgba(31,195,239,0.08)", border: "1px solid rgba(31,195,239,0.2)" }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--miami-blue)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
            What happens next
          </h3>
          <div className="flex flex-col gap-3">
            {[
              ["Your advisor reviews your preferences", "Within 24 hours"],
              ["We identify matching vehicles & pricing", "1–2 days"],
              ["You receive your personalized shortlist", "2–3 days"],
              ["Test drives & negotiation", "Your timeline"],
            ].map(([step, time], i) => (
              <div key={i} className="flex items-center gap-3 text-left">
                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                  style={{ background: "rgba(31,195,239,0.2)", color: "var(--miami-blue)" }}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>{step}</span>
                </div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>{time}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => navigate("/")} data-testid="btn-home"
          className="w-full py-3 rounded-xl font-bold transition-all hover:opacity-80"
          style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)", fontFamily: "Industry, sans-serif", fontSize: 14 }}>
          ← Return to Home
        </button>
      </div>
    </div>
  );
}
