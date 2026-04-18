import { useState } from "react";
import { MotoLogoFull } from "@/components/MotoLogo";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Client } from "@shared/schema";

const API = import.meta.env.VITE_API_URL || "https://portal.motosaic.com";

const ADMIN_USERNAME = "Admin";
const ADMIN_PASSWORD = "AdminMotosaic";

function AdminPasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      onUnlock();
    } else {
      setError(true);
      setPassword("");
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, #002639 0%, #004363 50%, #005a7a 100%)" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div className="flex justify-center mb-10">
          <MotoLogoFull height={36} />
        </div>
        <div className="rounded-2xl p-6 md:p-8" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--miami-blue)", marginBottom: 8 }}>Admin Access</p>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 24 }}>Dashboard Login</h2>
          <form onSubmit={handleSubmit} autoComplete="on">
            <label className="intake-label">Username</label>
            <input
              type="text"
              className="intake-input mb-4"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username"
              autoComplete="username"
              autoFocus
              style={error ? { borderColor: "#ef4444" } : {}}
            />
            <label className="intake-label">Password</label>
            <input
              type="password"
              className="intake-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              style={error ? { borderColor: "#ef4444" } : {}}
            />
            {error && (
              <p style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>Incorrect credentials. Try again.</p>
            )}
            <button
              type="submit"
              className="w-full mt-6 rounded-xl font-bold transition-all duration-200 hover:opacity-90"
              style={{ background: "var(--miami-blue)", color: "var(--shelby-blue)", fontSize: 14, fontWeight: 700, letterSpacing: "0.05em", minHeight: 48 }}
            >
              Enter Dashboard
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Minerva Sheet Card ────────────────────────────────────────────────────────────
function MinervaSheetCard() {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const { data: sheetData, refetch } = useQuery<{ sheetUrl: string }>({
    queryKey: ["/api/admin/sheet-url"],
    queryFn: async () => {
      const res = await fetch(`${API}/api/admin/sheet-url`);
      if (!res.ok) return null as any;
      return res.json();
    },
    retry: false,
    staleTime: 30_000,
  });

  const sheetUrl = sheetData?.sheetUrl ?? null;

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`${API}/api/admin/sync-sheet`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Sync failed");
      refetch();
    } catch (err: any) {
      setSyncError(err.message || "Unknown error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(173,240,41,0.08)", border: "1px solid rgba(173,240,41,0.2)" }}>
      <p style={{ fontSize: 11, color: "#ADF029", fontWeight: 700, marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        Minerva Sheet
      </p>
      {sheetUrl ? (
        <a
          href={sheetUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            fontSize: 12,
            fontWeight: 700,
            color: "#ADF029",
            textDecoration: "none",
            marginBottom: 8,
            padding: "6px 10px",
            borderRadius: 8,
            background: "rgba(173,240,41,0.12)",
            border: "1px solid rgba(173,240,41,0.25)",
            textAlign: "center",
          }}
        >
          Open Minerva Sheet →
        </a>
      ) : (
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", marginBottom: 8 }}>
          No sheet yet. Click Sync to create it.
        </p>
      )}
      <button
        onClick={handleSync}
        disabled={syncing}
        style={{
          width: "100%",
          fontSize: 11,
          fontWeight: 700,
          color: syncing ? "rgba(255,255,255,0.4)" : "#001f30",
          background: syncing ? "rgba(173,240,41,0.15)" : "#ADF029",
          border: "none",
          borderRadius: 8,
          padding: "6px 0",
          cursor: syncing ? "not-allowed" : "pointer",
          transition: "all 0.15s",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {syncing ? "Syncing..." : "Sync Now"}
      </button>
      {syncError && (
        <p style={{ fontSize: 10, color: "#ef4444", marginTop: 6 }}>{syncError}</p>
      )}
    </div>
  );
}

const STAGES = [
  { key: "discovery_booked",  label: "Discovery Booked",      shortLabel: "Discovery",  color: "#1FC3EF" },
  { key: "pending_proposal",  label: "Pending Proposal Sig",  shortLabel: "Proposal",   color: "#F59E0B" },
  { key: "scoping_booked",    label: "Scoping Call Booked",   shortLabel: "Scoping",    color: "#8B5CF6" },
  { key: "test_drives",       label: "Test Drives Scheduled", shortLabel: "Test Drive", color: "#ADF029" },
  { key: "pending_delivery",  label: "Pending Delivery",      shortLabel: "Delivery",   color: "#F97316" },
  { key: "closed",            label: "Closed",                shortLabel: "Closed",     color: "#10B981" },
];

function getStage(client: Client, stageMap: Record<number, string>): string {
  if (stageMap[client.id]) return stageMap[client.id];
  if (client.status === "closed") return "closed";
  if (client.status === "ready") return "test_drives";
  if (client.status === "in_progress") return "scoping_booked";
  return "discovery_booked";
}

function KanbanCard({
  client,
  onNavigate,
  onDragStart,
  onDragEnd,
}: {
  client: Client;
  onNavigate: (id: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const vehicle =
    [client.preferredMakes, client.preferredModels].filter(Boolean).join(" ") || "—";
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onNavigate(client.id)}
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 10,
        padding: "10px 12px",
        cursor: "grab",
        transition: "all 0.15s",
        marginBottom: 8,
      }}
      className="hover:border-[rgba(31,195,239,0.3)] hover:bg-[rgba(255,255,255,0.08)]"
    >
      <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 3 }}>
        {client.firstName} {client.lastName}
      </p>
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 2 }}>{vehicle}</p>
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{client.state || "—"}</p>
    </div>
  );
}

function KanbanBoard({
  clients,
  onNavigate,
}: {
  clients: Client[];
  onNavigate: (id: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("motosaic_pipeline_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [stageMap, setStageMap] = useState<Record<number, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("motosaic_pipeline") || "{}");
    } catch {
      return {};
    }
  });
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  function toggleCollapsed() {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem("motosaic_pipeline_collapsed", String(next)); } catch {}
      return next;
    });
  }

  function clientsInStage(stageKey: string) {
    return clients.filter(c => getStage(c, stageMap) === stageKey);
  }

  return (
    <div style={{ marginBottom: 24, borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
      {/* Header bar — always visible */}
      <div
        onClick={toggleCollapsed}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", cursor: "pointer",
          background: "rgba(255,255,255,0.03)",
          borderBottom: collapsed ? "none" : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
          {/* Kanban icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" style={{ flexShrink: 0 }}>
            <rect x="3" y="3" width="5" height="12" rx="1"/>
            <rect x="10" y="3" width="5" height="8" rx="1"/>
            <rect x="17" y="3" width="4" height="15" rx="1"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.7)", fontFamily: "Industry, sans-serif", textTransform: "uppercase", flexShrink: 0 }}>
            Pipeline
          </span>
          {/* Stage pills when collapsed */}
          {collapsed && (
            <div style={{ display: "flex", gap: 6, marginLeft: 8, flexWrap: "wrap" }}>
              {STAGES.map(stage => {
                const count = clientsInStage(stage.key).length;
                if (count === 0) return null;
                return (
                  <span key={stage.key} style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                    background: `${stage.color}18`, color: stage.color,
                    border: `1px solid ${stage.color}40`,
                  }}>
                    {stage.shortLabel} {count}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        {/* Expand/collapse chevron */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"
          style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      {/* Board — only when expanded */}
      {!collapsed && (
        <div style={{ display: "flex", gap: 0, overflowX: "auto", padding: "14px 12px" }}>
          {STAGES.map((stage, i) => (
            <div
              key={stage.key}
              style={{
                flex: "1 1 0", minWidth: 150, maxWidth: 220,
                borderRight: i < STAGES.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                padding: "0 10px",
                background: dragOverStage === stage.key ? "rgba(31,195,239,0.03)" : "transparent",
                borderRadius: dragOverStage === stage.key ? 8 : 0,
                transition: "background 0.15s",
              }}
              onDragOver={e => { e.preventDefault(); setDragOverStage(stage.key); }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={e => {
                e.preventDefault();
                if (draggedId !== null) {
                  const newMap = { ...stageMap, [draggedId]: stage.key };
                  setStageMap(newMap);
                  try { localStorage.setItem("motosaic_pipeline", JSON.stringify(newMap)); } catch {}
                }
                setDragOverStage(null);
              }}
            >
              {/* Column header */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: stage.color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "Industry, sans-serif", flex: 1, lineHeight: 1.3 }}>
                  {stage.label}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: stage.color, background: `${stage.color}18`, borderRadius: 10, padding: "1px 6px", border: `1px solid ${stage.color}30`, flexShrink: 0 }}>
                  {clientsInStage(stage.key).length}
                </span>
              </div>
              {/* Cards */}
              <div style={{ maxHeight: 380, overflowY: "auto" }}>
                {clientsInStage(stage.key).map(client => (
                  <KanbanCard
                    key={client.id}
                    client={client}
                    onNavigate={onNavigate}
                    onDragStart={() => setDraggedId(client.id)}
                    onDragEnd={() => { setDraggedId(null); setDragOverStage(null); }}
                  />
                ))}
                {clientsInStage(stage.key).length === 0 && (
                  <div style={{ padding: "16px 8px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>—</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const AGENTS: Record<string, { label: string; color: string }> = {
  mike_calcara:  { label: "Calcara",  color: "#1FC3EF" },
  mike_minerva:  { label: "Minerva",  color: "#ADF029" },
};

const STATUS_OPTIONS = ["new", "in_progress", "ready", "closed"];
const STATUS_LABELS: Record<string, string> = {
  new: "New",
  in_progress: "In Progress",
  ready: "Ready",
  closed: "Closed",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold badge-${status}`}
      style={{ fontFamily: "Industry, sans-serif", letterSpacing: "0.05em" }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-2xl p-4 md:p-5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 900, color: "white" }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: "var(--miami-blue)", marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

// Module-level unlock cache — persists across back-button navigation within the same tab
let _adminUnlocked = false;

export default function AdminDashboard() {
  const [unlocked, setUnlocked] = useState(_adminUnlocked);
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [mobileTab, setMobileTab] = useState<"clients" | "new">("clients");
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: docMap = {} } = useQuery<Record<number, string[]>>({
    queryKey: ["/api/documents/all"],
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/clients/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/clients"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/clients/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/clients"] }),
  });

  const reseedMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/reseed", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/clients"] }),
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  if (!unlocked) return <AdminPasswordGate onUnlock={() => { _adminUnlocked = true; setUnlocked(true); }} />;

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: clients.length,
    new: clients.filter(c => c.status === "new").length,
    in_progress: clients.filter(c => c.status === "in_progress").length,
    ready: clients.filter(c => c.status === "ready").length,
  };

  return (
    <div className="min-h-screen flex" style={{ background: "#001f30" }}>

      {/* ── Desktop Sidebar (hidden on mobile) ── */}
      <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 px-4 py-6 border-r" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="mb-8">
          <MotoLogoFull height={32} />
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.25)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8, paddingLeft: 14 }}>
          Navigation
        </p>
        <nav className="flex flex-col gap-1">
          <span className="sidebar-nav-item active" data-testid="nav-dashboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Dashboard
          </span>
          <span className="sidebar-nav-item" onClick={() => navigate("/intake")} data-testid="nav-new-client">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            New Client
          </span>
          <span className="sidebar-nav-item" onClick={() => navigate("/")} data-testid="nav-portal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Client Portal
          </span>
        </nav>
        <div className="mt-auto">
          <MinervaSheetCard />
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar */}
        <header className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5 border-b flex-shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          {/* Mobile: show logo */}
          <div className="flex items-center gap-3">
            <div className="lg:hidden">
              <MotoLogoFull height={28} />
            </div>
            <div className="hidden lg:block">
              <h1 style={{ fontSize: 20, fontWeight: 900, color: "white" }}>Client Dashboard</h1>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
            {/* Mobile title */}
            <div className="lg:hidden">
              <h1 style={{ fontSize: 16, fontWeight: 900, color: "white" }}>Dashboard</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {clients.length === 0 && (
              <button
                onClick={() => reseedMutation.mutate()}
                disabled={reseedMutation.isPending}
                data-testid="btn-seed-clients"
                className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all hover:opacity-90"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.9)", fontFamily: "Industry, sans-serif", border: "1px solid rgba(255,255,255,0.15)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
                </svg>
                {reseedMutation.isPending ? "Seeding..." : "Seed Example Clients"}
              </button>
            )}
            <button onClick={() => navigate("/intake")} data-testid="btn-new-client"
              className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl font-bold text-sm transition-all hover:opacity-90"
              style={{ background: "var(--miami-blue)", color: "var(--shelby-blue)", fontFamily: "Industry, sans-serif", minHeight: 40 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span className="hidden sm:inline">New Client</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6 pb-24 lg:pb-6">

          {/* Pipeline Kanban */}
          <KanbanBoard clients={clients} onNavigate={(id) => navigate(`/clients/${id}`)} />

          {/* Stats — 2-col on mobile, 4-col on desktop */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
            <StatCard label="Total Clients" value={stats.total} sub="All time" />
            <StatCard label="New" value={stats.new} sub="Awaiting review" />
            <StatCard label="In Progress" value={stats.in_progress} sub="Active" />
            <StatCard label="Ready" value={stats.ready} sub="Deal complete" />
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
            <div className="relative flex-1" style={{ maxWidth: 320 }}>
              <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="intake-input pl-9"
                placeholder="Search clients..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="input-search"
                style={{ paddingLeft: 36 }}
              />
            </div>
            {/* Status filter pills — scrollable on mobile */}
            <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0" style={{ scrollbarWidth: "none" }}>
              {["all", ...STATUS_OPTIONS].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  data-testid={`filter-${s}`}
                  className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                  style={{
                    background: filterStatus === s ? "var(--miami-blue)" : "rgba(255,255,255,0.07)",
                    color: filterStatus === s ? "var(--shelby-blue)" : "rgba(255,255,255,0.55)",
                    border: `1px solid ${filterStatus === s ? "var(--miami-blue)" : "rgba(255,255,255,0.1)"}`,
                    fontFamily: "Industry, sans-serif",
                    minHeight: 36,
                  }}>
                  {s === "all" ? "All" : STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Client list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: "var(--miami-blue)", borderTopColor: "transparent" }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.52)" }}>
                {search || filterStatus !== "all" ? "No clients match your filter." : "No clients yet. Share the portal link to get started."}
              </p>
              {!search && filterStatus === "all" && (
                <button onClick={() => navigate("/intake")} data-testid="btn-add-first"
                  className="mt-4 px-5 py-2 rounded-xl text-sm font-bold transition-all hover:opacity-90"
                  style={{ background: "var(--miami-blue)", color: "var(--shelby-blue)", fontFamily: "Industry, sans-serif" }}>
                  Add First Client
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map(client => (
                <div key={client.id}
                  className="client-card rounded-2xl overflow-hidden cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  onClick={() => navigate(`/admin/clients/${client.id}`)}
                  data-testid={`client-card-${client.id}`}>

                  <div className="flex items-center gap-3 px-4 md:px-5 py-4">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(31,195,239,0.2)" }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: "var(--miami-blue)" }}>
                        {client.firstName[0]}{client.lastName[0]}
                      </span>
                    </div>

                    {/* Name & info — takes all available space */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ fontWeight: 700, fontSize: 14, color: "white" }}>
                          {client.firstName} {client.lastName}
                        </span>
                        <StatusBadge status={client.status || "new"} />
                        {client.assignedTo && AGENTS[client.assignedTo] && (
                          <span className="hidden sm:inline px-2 py-0.5 rounded-full text-xs font-bold"
                            style={{ background: `${AGENTS[client.assignedTo].color}22`, color: AGENTS[client.assignedTo].color, border: `1px solid ${AGENTS[client.assignedTo].color}44` }}>
                            {AGENTS[client.assignedTo].label}
                          </span>
                        )}
                        {client.finalMake && (
                          <span className="hidden sm:inline px-2 py-0.5 rounded-full text-xs font-bold"
                            style={{ background: "rgba(242,234,0,0.1)", color: "#F2EA00", border: "1px solid rgba(242,234,0,0.2)" }}>
                            {client.finalMake} {client.finalModel}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.68)" }}>{client.email}</span>
                        {client.phone && <span className="hidden sm:inline" style={{ fontSize: 12, color: "rgba(255,255,255,0.78)" }}>{client.phone}</span>}
                        {client.city && <span className="hidden md:inline" style={{ fontSize: 12, color: "rgba(255,255,255,0.78)" }}>{client.city}, {client.state}</span>}
                      </div>
                      {/* Doc pills — shown inline below name on mobile */}
                      <div className="flex items-center gap-1.5 mt-2 lg:hidden flex-wrap" onClick={e => e.stopPropagation()}>
                        {[
                          { key: "drivers_license_front", short: "DL F" },
                          { key: "drivers_license_back",  short: "DL B" },
                          { key: "proof_of_insurance",    short: "Ins." },
                          { key: "insurance_id_card",     short: "Upd. Ins." },
                        ].map(({ key, short }) => {
                          const done = (docMap[client.id] || []).includes(key);
                          return (
                            <span key={key} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold"
                              style={{
                                background: done ? "rgba(173,240,41,0.1)" : "rgba(255,255,255,0.05)",
                                color: done ? "#ADF029" : "rgba(255,255,255,0.25)",
                                border: `1px solid ${done ? "rgba(173,240,41,0.25)" : "rgba(255,255,255,0.08)"}`,
                                fontFamily: "Industry, sans-serif",
                              }}>
                              {done ? (
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#ADF029" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                              ) : (
                                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                              )}
                              {short}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* Desktop: vehicle interest */}
                    <div className="hidden md:block text-right flex-shrink-0" style={{ minWidth: 120 }}>
                      {client.budget && (
                        <p style={{ fontSize: 12, color: "var(--miami-blue)", fontWeight: 600 }}>{client.budget}</p>
                      )}
                      {client.purchaseType && (
                        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.52)", textTransform: "capitalize" }}>{client.purchaseType}</p>
                      )}
                    </div>

                    {/* Desktop: doc pills */}
                    <div className="hidden lg:flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      {[
                        { key: "drivers_license_front", short: "DL Front" },
                        { key: "drivers_license_back",  short: "DL Back" },
                        { key: "proof_of_insurance",    short: "Insurance" },
                        { key: "insurance_id_card",     short: "Updated Ins." },
                      ].map(({ key, short }) => {
                        const done = (docMap[client.id] || []).includes(key);
                        return (
                          <span key={key} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold"
                            style={{
                              background: done ? "rgba(173,240,41,0.1)" : "rgba(255,255,255,0.05)",
                              color: done ? "#ADF029" : "rgba(255,255,255,0.25)",
                              border: `1px solid ${done ? "rgba(173,240,41,0.25)" : "rgba(255,255,255,0.08)"}`,
                              fontFamily: "Industry, sans-serif",
                            }}>
                            {done ? (
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#ADF029" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            ) : (
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            )}
                            {short}
                          </span>
                        );
                      })}
                    </div>

                    {/* Status dropdown — smaller on mobile */}
                    <div className="flex-shrink-0 ml-1 flex items-center gap-1.5 md:gap-2" onClick={e => e.stopPropagation()}>
                      <select
                        value={client.status || "new"}
                        onChange={e => statusMutation.mutate({ id: client.id, status: e.target.value })}
                        data-testid={`status-select-${client.id}`}
                        className="rounded-lg px-2 py-1.5 text-xs font-bold cursor-pointer"
                        style={{
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          color: "rgba(255,255,255,0.9)",
                          fontFamily: "Industry, sans-serif",
                          minHeight: 34,
                        }}>
                        {STATUS_OPTIONS.map(s => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                      {/* Delete button */}
                      {confirmDeleteId === client.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { deleteMutation.mutate(client.id); setConfirmDeleteId(null); }}
                            className="px-2 py-1.5 rounded-lg text-xs font-bold transition-all"
                            style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.35)", fontFamily: "Industry, sans-serif" }}>
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1.5 rounded-lg text-xs font-bold transition-all"
                            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.68)", border: "1px solid rgba(255,255,255,0.1)", fontFamily: "Industry, sans-serif" }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(client.id)}
                          data-testid={`delete-client-${client.id}`}
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:opacity-80"
                          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                          </svg>
                        </button>
                      )}
                    </div>

                    <svg className="flex-shrink-0 ml-1" width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="rgba(255,255,255,0.25)" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>

                  {/* Bottom strip — Drive link if available */}
                  {client.driveFolder && (
                    <div className="px-4 md:px-5 py-2 flex items-center gap-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gelbgrun)" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span style={{ fontSize: 11, color: "var(--gelbgrun)" }}>Synced to Google Drive</span>
                      <a href={client.driveFolder} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: 11, color: "rgba(255,255,255,0.78)", marginLeft: "auto" }}>
                        Open folder →
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Mobile bottom tab bar (hidden on lg+) ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch border-t"
        style={{ background: "#001a28", borderColor: "rgba(255,255,255,0.1)", height: 60 }}>
        {/* Clients tab */}
        <button
          onClick={() => setMobileTab("clients")}
          className="flex-1 flex flex-col items-center justify-center gap-1 transition-all"
          style={{ color: mobileTab === "clients" ? "var(--miami-blue)" : "rgba(255,255,255,0.35)" }}
          data-testid="tab-clients"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "Industry, sans-serif", letterSpacing: "0.06em" }}>Clients</span>
        </button>

        {/* New Client tab */}
        <button
          onClick={() => navigate("/intake")}
          className="flex-1 flex flex-col items-center justify-center gap-1 transition-all"
          style={{ color: "rgba(255,255,255,0.78)" }}
          data-testid="tab-new-client"
        >
          <div className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "var(--miami-blue)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--shelby-blue)" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "Industry, sans-serif", letterSpacing: "0.06em", color: "rgba(255,255,255,0.78)" }}>New</span>
        </button>

        {/* Portal tab */}
        <button
          onClick={() => navigate("/")}
          className="flex-1 flex flex-col items-center justify-center gap-1 transition-all"
          style={{ color: "rgba(255,255,255,0.78)" }}
          data-testid="tab-portal"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "Industry, sans-serif", letterSpacing: "0.06em" }}>Portal</span>
        </button>
      </nav>
    </div>
  );
}

