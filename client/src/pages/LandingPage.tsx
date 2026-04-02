import { useLocation } from "wouter";
import { MotoLogoFull } from "@/components/MotoLogo";

export default function LandingPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #002639 0%, #004363 50%, #005a7a 100%)" }}>

      {/* Background geometric shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: "var(--miami-blue)" }} />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full opacity-8"
          style={{ background: "var(--miami-blue)" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5"
          style={{ background: "var(--miami-blue)" }} />
      </div>

      {/* Admin access — top right corner */}
      <button
        onClick={() => navigate("/admin")}
        className="absolute top-4 right-4 z-20 transition-opacity duration-200 hover:opacity-100"
        style={{ opacity: 0.35, fontSize: 11, color: "rgba(255,255,255,0.8)", letterSpacing: "0.1em", textTransform: "uppercase", background: "none", border: "none", cursor: "pointer", padding: "6px 10px" }}
      >
        Admin
      </button>

      <div className="relative z-10 text-center px-8 animate-in" style={{ maxWidth: 560 }}>
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <MotoLogoFull height={52} />
        </div>

        {/* Tagline */}
        <p className="mb-3" style={{ color: "var(--miami-blue)", fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" }}>
          Client Portal
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: "white", lineHeight: 1.2, marginBottom: 16 }}>
          Your Car Buying Journey Starts Here
        </h1>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, marginBottom: 40 }}>
          Complete your intake form and upload your documents — we'll take it from there. The Motosaic team handles everything so you drive away in the right car at the right price.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => navigate("/portal")}
            data-testid="btn-start-intake"
            className="w-full py-4 rounded-xl font-bold text-base transition-all duration-200 hover:opacity-90 active:scale-95"
            style={{
              background: "var(--miami-blue)",
              color: "var(--shelby-blue)",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}>
            Client Portal — Start Here
          </button>

        </div>

        {/* Trust indicators */}
        <div className="flex items-center justify-center gap-6 mt-10" style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
          <span className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Secure &amp; Encrypted
          </span>
          <span className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            White-Glove Service
          </span>
          <span className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            5-Min Form
          </span>
        </div>
      </div>
    </div>
  );
}
