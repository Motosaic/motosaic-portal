import { useLocation } from "wouter";

export default function NotFound() {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "#001f30" }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, color: "white", marginBottom: 8 }}>Page Not Found</h1>
      <button onClick={() => navigate("/admin")}
        style={{ color: "var(--miami-blue)", fontFamily: "Industry, sans-serif", fontSize: 14 }}>
        ← Back to Dashboard
      </button>
    </div>
  );
}
