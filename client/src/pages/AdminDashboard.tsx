import { useState } from "react";
import { MotoLogoFull } from "@/components/MotoLogo";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Client } from "@shared/schema";

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
    <div className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: "linear-gradient(135deg, #002639 0%, #004363 50%, #005a7a 100%)" }}>
      <div style={{ width: "100%", maxWidth: 380, padding: "0 24px" }}>
        <div className="flex justify-center mb-10">
          <MotoLogoFull height={36} />
        </div>
        <div className="rounded-2xl p-8" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
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
              className="w-full mt-6 py-3 rounded-xl font-bold transition-all duration-200 hover:opacity-90"
              style={{ background: "var(--miami-blue)", color: "var(--shelby-blue)", fontSize: 14, fontWeight: 700, letterSpacing: "0.05em" }}
            >
              Enter Dashboard
            </button>
          </form>
        </div>
      </div>
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
    <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 900, color: "white" }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: "var(--miami-blue)", marginTop: 4 }}>{sub}</p>}
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
      {/* Sidebar */}
      <aside className="flex flex-col w-56 flex-shrink-0 px-4 py-6 border-r" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
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
          <div className="rounded-xl p-4" style={{ background: "rgba(31,195,239,0.08)", border: "1px solid rgba(31,195,239,0.15)" }}>
            <p style={{ fontSize: 11, color: "var(--miami-blue)", fontWeight: 700, marginBottom: 4 }}>Google Drive Sync</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>Push client data to Drive from the client detail view.</p>
            <a href="https://drive.google.com" target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: "var(--miami-blue)", textDecoration: "underline" }}>
              Open Drive →
            </a>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-8 py-5 border-b flex-shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "white" }}>Client Dashboard</h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {clients.length === 0 && (
              <button
                onClick={() => reseedMutation.mutate()}
                disabled={reseedMutation.isPending}
                data-testid="btn-seed-clients"
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all hover:opacity-90"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", fontFamily: "Industry, sans-serif", border: "1px solid rgba(255,255,255,0.15)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
                </svg>
                {reseedMutation.isPending ? "Seeding..." : "Seed Example Clients"}
              </button>
            )}
            <button onClick={() => navigate("/intake")} data-testid="btn-new-client"
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all hover:opacity-90"
              style={{ background: "var(--miami-blue)", color: "var(--shelby-blue)", fontFamily: "Industry, sans-serif" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Client
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Clients" value={stats.total} sub="All time" />
            <StatCard label="New" value={stats.new} sub="Awaiting review" />
            <StatCard label="In Progress" value={stats.in_progress} sub="Active" />
            <StatCard label="Ready" value={stats.ready} sub="Deal complete" />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-5">
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
            <div className="flex gap-2">
              {["all", ...STATUS_OPTIONS].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  data-testid={`filter-${s}`}
                  className="px-3 py-2 rounded-lg text-xs font-bold transition-all"
                  style={{
                    background: filterStatus === s ? "var(--miami-blue)" : "rgba(255,255,255,0.07)",
                    color: filterStatus === s ? "var(--shelby-blue)" : "rgba(255,255,255,0.55)",
                    border: `1px solid ${filterStatus === s ? "var(--miami-blue)" : "rgba(255,255,255,0.1)"}`,
                    fontFamily: "Industry, sans-serif",
                  }}>
                  {s === "all" ? "All" : STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Client table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: "var(--miami-blue)", borderTopColor: "transparent" }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <p style={{ fontSize: 15, color: "rgba(255,255,255,0.3)" }}>
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
                  <div className="flex items-center gap-4 px-5 py-4">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(31,195,239,0.2)" }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: "var(--miami-blue)" }}>
                        {client.firstName[0]}{client.lastName[0]}
                      </span>
                    </div>

                    {/* Name & info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span style={{ fontWeight: 700, fontSize: 15, color: "white" }}>
                          {client.firstName} {client.lastName}
                        </span>
                        <StatusBadge status={client.status || "new"} />
                        {client.assignedTo && AGENTS[client.assignedTo] && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                            style={{ background: `${AGENTS[client.assignedTo].color}22`, color: AGENTS[client.assignedTo].color, border: `1px solid ${AGENTS[client.assignedTo].color}44` }}>
                            {AGENTS[client.assignedTo].label}
                          </span>
                        )}
                        {client.finalMake && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                            style={{ background: "rgba(242,234,0,0.1)", color: "#F2EA00", border: "1px solid rgba(242,234,0,0.2)" }}>
                            {client.finalMake} {client.finalModel}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 flex-wrap">
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{client.email}</span>
                        {client.phone && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{client.phone}</span>}
                        {client.city && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{client.city}, {client.state}</span>}
                      </div>
                    </div>

                    {/* Vehicle interest */}
                    <div className="hidden md:block text-right flex-shrink-0" style={{ minWidth: 140 }}>
                      {client.vehicleCondition && (
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                          {client.vehicleCondition === "new" ? "New" : client.vehicleCondition === "used" ? "Used" : "New or Used"}
                        </p>
                      )}
                      {client.budget && (
                        <p style={{ fontSize: 12, color: "var(--miami-blue)", fontWeight: 600 }}>{client.budget}</p>
                      )}
                      {client.purchaseType && (
                        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "capitalize" }}>{client.purchaseType}</p>
                      )}
                    </div>

                    {/* Doc checklist pills */}
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

                    {/* Status dropdown */}
                    <div className="flex-shrink-0 ml-2 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <select
                        value={client.status || "new"}
                        onChange={e => statusMutation.mutate({ id: client.id, status: e.target.value })}
                        data-testid={`status-select-${client.id}`}
                        className="rounded-lg px-2 py-1.5 text-xs font-bold cursor-pointer"
                        style={{
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          color: "rgba(255,255,255,0.7)",
                          fontFamily: "Industry, sans-serif",
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
                            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.1)", fontFamily: "Industry, sans-serif" }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(client.id)}
                          data-testid={`delete-client-${client.id}`}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-80"
                          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                          </svg>
                        </button>
                      )}
                    </div>

                    <svg className="flex-shrink-0 ml-2" width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="rgba(255,255,255,0.25)" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </div>

                  {/* Bottom strip — Drive link if available */}
                  {client.driveFolder && (
                    <div className="px-5 py-2 flex items-center gap-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gelbgrun)" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span style={{ fontSize: 11, color: "var(--gelbgrun)" }}>Synced to Google Drive</span>
                      <a href={client.driveFolder} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginLeft: "auto" }}>
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
    </div>
  );
}
