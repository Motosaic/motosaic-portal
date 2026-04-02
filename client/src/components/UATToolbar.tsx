import { useLocation } from "wouter";

interface UATToolbarProps {
  clientId: string | number;
  /** Which page is currently active, so we can highlight it */
  current: "portal" | "intake" | "documents";
}

export function UATToolbar({ clientId, current }: UATToolbarProps) {
  const [, navigate] = useLocation();

  const stages: { key: UATToolbarProps["current"]; label: string; path: string }[] = [
    { key: "portal",    label: "Dashboard",   path: "/portal" },
    { key: "intake",    label: "Questionnaire", path: `/intake/${clientId}` },
    { key: "documents", label: "Documents",   path: `/documents/${clientId}` },
  ];

  return (
    <div
      className="fixed bottom-4 left-1/2 z-[9999] flex items-center gap-1 rounded-2xl px-3 py-2 shadow-2xl"
      style={{
        transform: "translateX(-50%)",
        background: "rgba(0,20,35,0.96)",
        border: "1px solid rgba(242,234,0,0.4)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 4px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(242,234,0,0.15)",
        // Sit above the mobile sticky nav bar (z-50) without conflicting
        marginBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* UAT badge */}
      <span
        className="mr-2 px-2 py-0.5 rounded-md text-xs font-black"
        style={{
          background: "rgba(242,234,0,0.15)",
          color: "var(--sao-paulo)",
          border: "1px solid rgba(242,234,0,0.3)",
          fontFamily: "Industry, sans-serif",
          letterSpacing: "0.08em",
          fontSize: 10,
        }}
      >
        UAT
      </span>

      {/* Stage buttons */}
      {stages.map(s => (
        <button
          key={s.key}
          type="button"
          onClick={() => navigate(s.path)}
          className="rounded-xl font-bold transition-all active:scale-95"
          style={{
            background: current === s.key ? "var(--sao-paulo)" : "rgba(255,255,255,0.08)",
            color: current === s.key ? "var(--shelby-blue)" : "rgba(255,255,255,0.7)",
            border: `1px solid ${current === s.key ? "var(--sao-paulo)" : "rgba(255,255,255,0.1)"}`,
            fontFamily: "Industry, sans-serif",
            fontSize: 12,
            minHeight: 36,
            padding: "0 14px",
            whiteSpace: "nowrap",
          }}
          data-testid={`uat-nav-${s.key}`}
        >
          {s.label}
        </button>
      ))}

      {/* Divider */}
      <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.12)", margin: "0 4px" }} />

      {/* Admin shortcut */}
      <button
        type="button"
        onClick={() => navigate("/admin")}
        className="rounded-xl font-bold transition-all active:scale-95"
        style={{
          background: "rgba(31,195,239,0.12)",
          color: "var(--miami-blue)",
          border: "1px solid rgba(31,195,239,0.25)",
          fontFamily: "Industry, sans-serif",
          fontSize: 12,
          minHeight: 36,
          padding: "0 14px",
          whiteSpace: "nowrap",
        }}
        data-testid="uat-nav-admin"
      >
        Admin →
      </button>
    </div>
  );
}
