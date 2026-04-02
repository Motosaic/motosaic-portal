import { useState } from "react";
import { MotoLogoFull } from "@/components/MotoLogo";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Client, Document } from "@shared/schema";

// ─── Constants ───────────────────────────────────────────────────────────────
const AGENTS = [
  { key: "mike_standen",  label: "Mike Standen",  initials: "MS", color: "#1FC3EF" },
  { key: "mike_minerva",  label: "Mike Minerva",  initials: "MM", color: "#ADF029" },
];

const STATUS_OPTIONS = [
  { value: "new",         label: "New" },
  { value: "in_progress", label: "In Progress" },
  { value: "ready",       label: "Ready" },
  { value: "closed",      label: "Closed" },
];

const DOC_LABELS: Record<string, string> = {
  drivers_license_front:     "Driver's License — Front",
  drivers_license_back:      "Driver's License — Back",
  proof_of_insurance:        "Current Proof of Insurance",
  insurance_id_card:         "Updated Insurance — ID Card",
  insurance_binder:          "Updated Insurance — Policy Binder",
  income:                    "Proof of Income",
  registration:              "Current Registration",
  other:                     "Other Document",
};

// ─── Small helpers ────────────────────────────────────────────────────────────
function parseJson(str?: string | null): string[] {
  try { return JSON.parse(str || "[]"); } catch { return []; }
}
function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, icon, children, accent }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; accent?: string;
}) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${accent || "rgba(255,255,255,0.09)"}` }}>
      <div className="flex items-center gap-3 px-5 py-4 border-b"
        style={{ borderColor: accent || "rgba(255,255,255,0.07)" }}>
        <span style={{ color: accent || "var(--miami-blue)" }}>{icon}</span>
        <h3 style={{ fontWeight: 700, fontSize: 14, color: "white", letterSpacing: "0.03em" }}>{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null | boolean }) {
  if (!value && value !== false) return null;
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase", minWidth: 120, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.82)", flex: 1 }}>{String(value)}</span>
    </div>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span className="px-2.5 py-1 rounded-lg text-xs font-bold"
      style={{ background: "rgba(31,195,239,0.12)", color: "var(--miami-blue)", border: "1px solid rgba(31,195,239,0.2)" }}>
      {label}
    </span>
  );
}

// ─── Assignee Picker ──────────────────────────────────────────────────────────
function AssigneePicker({ clientId, current, onChange }: {
  clientId: number; current?: string | null; onChange: () => void;
}) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: (assignedTo: string | null) =>
      apiRequest("PATCH", `/api/clients/${clientId}/assigned-to`, { assignedTo }),
    onSuccess: () => { onChange(); toast({ title: "Assignment saved" }); },
  });

  return (
    <div className="flex gap-3 flex-wrap">
      {AGENTS.map(agent => {
        const active = current === agent.key;
        return (
          <button key={agent.key}
            onClick={() => mutation.mutate(active ? null : agent.key)}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-bold text-sm transition-all"
            style={{
              background: active ? `${agent.color}22` : "rgba(255,255,255,0.05)",
              border: `2px solid ${active ? agent.color : "rgba(255,255,255,0.1)"}`,
              color: active ? agent.color : "rgba(255,255,255,0.5)",
              fontFamily: "Industry, sans-serif",
            }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black"
              style={{ background: active ? `${agent.color}33` : "rgba(255,255,255,0.08)", color: active ? agent.color : "rgba(255,255,255,0.4)" }}>
              {agent.initials}
            </div>
            {agent.label}
            {active && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )}
          </button>
        );
      })}
      {!current && (
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", alignSelf: "center", paddingLeft: 4 }}>
          Not assigned — click to assign
        </span>
      )}
    </div>
  );
}

// ─── Deal Builder ─────────────────────────────────────────────────────────────
function DealBuilder({ client, onSave }: { client: Client; onSave: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    finalMake:      client.finalMake      || "",
    finalModel:     client.finalModel     || "",
    finalTrim:      client.finalTrim      || "",
    finalExtColor:  client.finalExtColor  || "",
    finalIntColor:  client.finalIntColor  || "",
    finalOptions:   client.finalOptions   || "",
    finalZip:       client.finalZip       || client.zip || "",
    finalDealNotes: client.finalDealNotes || "",
  });
  const [dirty, setDirty] = useState(false);

  const mutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/clients/${client.id}/deal-build`, form),
    onSuccess: () => { setDirty(false); onSave(); toast({ title: "Deal build saved" }); },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [key]: e.target.value }));
    setDirty(true);
  };

  // Pre-fill suggestions from questionnaire
  const suggestedMakes = parseJson(client.preferredMakes);
  const suggestedExt   = client.exteriorColors || "";
  const suggestedInt   = parseJson(client.interiorColors);

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: "10px 14px",
    color: "white",
    fontSize: 14,
    fontFamily: "Industry, sans-serif",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(255,255,255,0.4)",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    marginBottom: 6,
    display: "block",
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Suggestion bar */}
      {(suggestedMakes.length > 0 || suggestedExt || suggestedInt.length > 0) && (
        <div className="rounded-xl px-4 py-3"
          style={{ background: "rgba(242,234,0,0.06)", border: "1px solid rgba(242,234,0,0.15)" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#F2EA00", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
            Client Preferences (from questionnaire)
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestedMakes.map((m: string) => (
              <span key={m} className="px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer hover:opacity-80 transition-opacity"
                style={{ background: "rgba(242,234,0,0.12)", color: "#F2EA00", border: "1px solid rgba(242,234,0,0.25)" }}
                onClick={() => { setForm(f => ({ ...f, finalMake: m })); setDirty(true); }}>
                {m} ↑
              </span>
            ))}
            {suggestedExt && (
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", alignSelf: "center" }}>
                Ext: {suggestedExt}
              </span>
            )}
            {suggestedInt.map((c: string) => (
              <span key={c} style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", alignSelf: "center" }}>
                Int: {c}
              </span>
            ))}
          </div>
          {client.mustHaveFeatures && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 8 }}>
              Must-haves: {client.mustHaveFeatures}
            </p>
          )}
        </div>
      )}

      {/* 2-col grid for main fields */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={labelStyle}>Make</label>
          <input style={fieldStyle} value={form.finalMake} onChange={set("finalMake")} placeholder="e.g. BMW" />
        </div>
        <div>
          <label style={labelStyle}>Model</label>
          <input style={fieldStyle} value={form.finalModel} onChange={set("finalModel")} placeholder="e.g. M3" />
        </div>
        <div>
          <label style={labelStyle}>Trim / Package</label>
          <input style={fieldStyle} value={form.finalTrim} onChange={set("finalTrim")} placeholder="e.g. Competition xDrive" />
        </div>
        <div>
          <label style={labelStyle}>Shipping ZIP</label>
          <input style={fieldStyle} value={form.finalZip} onChange={set("finalZip")} placeholder="e.g. 33101" />
        </div>
        <div>
          <label style={labelStyle}>Exterior Color</label>
          <input style={fieldStyle} value={form.finalExtColor} onChange={set("finalExtColor")} placeholder="e.g. Brooklyn Grey" />
        </div>
        <div>
          <label style={labelStyle}>Interior Color</label>
          <input style={fieldStyle} value={form.finalIntColor} onChange={set("finalIntColor")} placeholder="e.g. Black Merino" />
        </div>
      </div>

      {/* Options / config */}
      <div>
        <label style={labelStyle}>Must-Have Options / Configuration</label>
        <textarea style={{ ...fieldStyle, minHeight: 80, resize: "vertical" }}
          value={form.finalOptions} onChange={set("finalOptions")}
          placeholder="e.g. Sunroof, HUD, M Sport brakes, no sunroof delete, carbon fiber trim..." />
      </div>

      {/* Deal notes for Mike */}
      <div>
        <label style={labelStyle}>Deal Notes for Sourcing</label>
        <textarea style={{ ...fieldStyle, minHeight: 80, resize: "vertical" }}
          value={form.finalDealNotes} onChange={set("finalDealNotes")}
          placeholder="Internal notes for Mike Minerva — budget constraints, timing, dealer preferences, etc." />
      </div>

      {/* Save */}
      <div className="flex items-center justify-between pt-1">
        <p style={{ fontSize: 12, color: dirty ? "#F2EA00" : "rgba(255,255,255,0.25)" }}>
          {dirty ? "Unsaved changes" : (client.finalMake ? "Deal build saved" : "Not yet configured")}
        </p>
        <button onClick={() => mutation.mutate()} disabled={!dirty || mutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:opacity-90 disabled:opacity-40"
          style={{ background: "var(--miami-blue)", color: "var(--shelby-blue)", fontFamily: "Industry, sans-serif" }}>
          {mutation.isPending ? (
            <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "var(--shelby-blue)", borderTopColor: "transparent" }} />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
          Save Deal Build
        </button>
      </div>
    </div>
  );
}

// ─── Documents panel ──────────────────────────────────────────────────────────
function DocPanel({ docs, clientId }: { docs: Document[]; clientId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (docId: number) => apiRequest("DELETE", `/api/documents/${docId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/clients", clientId, "documents"] }),
  });

  if (docs.length === 0) {
    return <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No documents uploaded yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {docs.map(doc => (
        <div key={doc.id} className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {/* Icon */}
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(31,195,239,0.12)" }}>
            {doc.mimeType === "application/pdf" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--miami-blue)" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--miami-blue)" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            )}
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: 13, color: "white", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {DOC_LABELS[doc.docType] || doc.docType}
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
              {doc.originalName} · {fmt(doc.fileSize)}
            </p>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <a href={`https://portal.motosaic.com/api/uploads/${doc.storedName}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:opacity-80"
              style={{ background: "rgba(173,240,41,0.12)", color: "var(--gelbgrun)", border: "1px solid rgba(173,240,41,0.2)", textDecoration: "none" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download
            </a>
            <button onClick={() => deleteMutation.mutate(doc.id)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-80"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);

  const { data: client, isLoading } = useQuery<Client>({
    queryKey: ["/api/clients", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/clients/${id}`);
      const data = await res.json();
      setNotes(data.notes || "");
      return data;
    },
  });

  const { data: docs = [] } = useQuery<Document[]>({
    queryKey: ["/api/clients", id, "documents"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/clients/${id}/documents`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const notesMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/clients/${id}/notes`, { notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/clients", id] }); setEditingNotes(false); toast({ title: "Notes saved" }); },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => apiRequest("PATCH", `/api/clients/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/clients", id] }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/clients", id] });

  if (isLoading || !client) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#001f30" }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: "var(--miami-blue)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const bodyStyles    = parseJson(client.bodyStyles);
  const preferredMakes = parseJson(client.preferredMakes);
  const intColors     = parseJson(client.interiorColors);
  const assignedAgent = AGENTS.find(a => a.key === client.assignedTo);
  const dealComplete  = !!(client.finalMake && client.finalModel);

  return (
    <div className="min-h-screen flex" style={{ background: "#001520" }}>

      {/* ── Sidebar ── */}
      <aside className="flex flex-col w-56 flex-shrink-0 px-4 py-6 border-r"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "#001a28" }}>
        <div className="mb-8"><MotoLogoFull height={32} /></div>
        <nav className="flex flex-col gap-1">
          <span className="sidebar-nav-item" onClick={() => navigate("/admin")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            All Clients
          </span>
          <span className="sidebar-nav-item active">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            Client Detail
          </span>
          <span className="sidebar-nav-item" onClick={() => navigate(`/documents/${id}`)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload Docs
          </span>
        </nav>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto">

        {/* Header */}
        <header className="flex items-center justify-between px-8 py-5 border-b sticky top-0 z-10"
          style={{ borderColor: "rgba(255,255,255,0.08)", background: "#001520" }}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: assignedAgent ? `${assignedAgent.color}22` : "rgba(31,195,239,0.15)" }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: assignedAgent?.color || "var(--miami-blue)" }}>
                {client.firstName[0]}{client.lastName[0]}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 style={{ fontSize: 20, fontWeight: 900, color: "white" }}>
                  {client.firstName} {client.lastName}
                </h1>
                {assignedAgent && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{ background: `${assignedAgent.color}22`, color: assignedAgent.color, border: `1px solid ${assignedAgent.color}44` }}>
                    {assignedAgent.label}
                  </span>
                )}
                {dealComplete && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{ background: "rgba(173,240,41,0.12)", color: "var(--gelbgrun)", border: "1px solid rgba(173,240,41,0.25)" }}>
                    Deal Built
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                {client.email} · {client.phone}
                {client.city && ` · ${client.city}, ${client.state}`}
              </p>
            </div>
          </div>

          {/* Status selector */}
          <div className="flex items-center gap-3">
            {client.driveFolder && (
              <a href={client.driveFolder} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all hover:opacity-80"
                style={{ background: "rgba(173,240,41,0.1)", color: "var(--gelbgrun)", border: "1px solid rgba(173,240,41,0.2)", textDecoration: "none" }}>
                Open Drive
              </a>
            )}
            <select value={client.status || "new"} onChange={e => statusMutation.mutate(e.target.value)}
              className="rounded-xl px-3 py-2 text-xs font-bold cursor-pointer"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)", fontFamily: "Industry, sans-serif" }}>
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </header>

        {/* ── Page body ── */}
        <div className="px-8 py-6 flex flex-col gap-5 max-w-5xl">

          {/* ── 1. ASSIGNMENT ── */}
          <SectionCard title="Deal Assignment" accent="rgba(31,195,239,0.25)" icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          }>
            <AssigneePicker clientId={client.id} current={client.assignedTo} onChange={refresh} />
          </SectionCard>

          {/* ── 2. CLIENT SNAPSHOT ── */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <SectionCard title="Client Overview" icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              }>
                <div className="grid grid-cols-2 gap-x-6">
                  <div>
                    <Row label="Name"      value={`${client.firstName} ${client.lastName}`} />
                    <Row label="Phone"     value={client.phone} />
                    <Row label="Email"     value={client.email} />
                    {client.address && <Row label="Address" value={`${client.address}, ${client.city}, ${client.state} ${client.zip}`} />}
                  </div>
                  <div>
                    <Row label="Purchase"  value={client.purchaseType} />
                    <Row label="Budget"    value={client.budget} />
                    <Row label="Down Pmt"  value={client.downPayment} />
                    <Row label="Monthly"   value={client.monthlyPayment} />
                    <Row label="Credit"    value={client.creditScore} />
                    <Row label="Timeframe" value={client.timeframe} />
                  </div>
                </div>
              </SectionCard>
            </div>

            {/* Vehicle wish list */}
            <SectionCard title="What They Want" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 1 1 4.93 19.07"/>
              </svg>
            }>
              <div className="flex flex-col gap-3">
                {preferredMakes.length > 0 && (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Makes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {preferredMakes.map((m: string) => <Pill key={m} label={m} />)}
                    </div>
                  </div>
                )}
                {bodyStyles.length > 0 && (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Body Style</p>
                    <div className="flex flex-wrap gap-1.5">
                      {bodyStyles.map((s: string) => <Pill key={s} label={s} />)}
                    </div>
                  </div>
                )}
                {client.exteriorColors && (
                  <Row label="Ext Color" value={client.exteriorColors} />
                )}
                {intColors.length > 0 && (
                  <Row label="Int Color" value={intColors.join(", ")} />
                )}
                {client.mustHaveFeatures && (
                  <Row label="Must-Have" value={client.mustHaveFeatures} />
                )}
                {client.preferredModels && (
                  <Row label="Models" value={client.preferredModels} />
                )}
              </div>
            </SectionCard>
          </div>

          {/* ── 3. FINAL DEAL BUILD ── */}
          <SectionCard title="Final Vehicle Build" accent="rgba(242,234,0,0.3)" icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F2EA00" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 1 1 4.93 19.07"/>
            </svg>
          }>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
              Complete this section to send the deal to Mike Minerva for sourcing. Pre-populated with client preferences — adjust as needed.
            </p>
            <DealBuilder client={client} onSave={refresh} />
          </SectionCard>

          {/* ── 4. DOCUMENTS ── */}
          <SectionCard title={`Client Documents (${docs.length})`} icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          }>
            <DocPanel docs={docs} clientId={id} />
          </SectionCard>

          {/* ── 5. TRADE-IN ── */}
          {client.hasTradeIn && (
            <SectionCard title="Trade-In Vehicle" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            }>
              <div className="grid grid-cols-2 gap-x-6">
                <div>
                  <Row label="Year"      value={client.tradeYear} />
                  <Row label="Make"      value={client.tradeMake} />
                  <Row label="Model"     value={client.tradeModel} />
                  <Row label="Trim"      value={client.tradeTrim} />
                </div>
                <div>
                  <Row label="Mileage"   value={client.tradeMileage} />
                  <Row label="Condition" value={client.tradeCondition} />
                  <Row label="Owed"      value={client.tradeOwed} />
                </div>
              </div>
            </SectionCard>
          )}

          {/* ── 6. NOTES ── */}
          <SectionCard title="Internal Notes" icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          }>
            {editingNotes ? (
              <div className="flex flex-col gap-3">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={4}
                  style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "10px 14px", color: "white", fontSize: 14, fontFamily: "Industry, sans-serif", resize: "vertical" }}
                />
                <div className="flex gap-2">
                  <button onClick={() => notesMutation.mutate()}
                    className="px-4 py-2 rounded-xl text-sm font-bold"
                    style={{ background: "var(--miami-blue)", color: "var(--shelby-blue)", fontFamily: "Industry, sans-serif" }}>
                    Save Notes
                  </button>
                  <button onClick={() => setEditingNotes(false)}
                    className="px-4 py-2 rounded-xl text-sm font-bold"
                    style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", fontFamily: "Industry, sans-serif" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <p style={{ fontSize: 13, color: client.notes ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)", lineHeight: 1.6, whiteSpace: "pre-wrap", flex: 1 }}>
                  {client.notes || "No notes yet — click Edit to add internal notes."}
                </p>
                <button onClick={() => setEditingNotes(true)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)", fontFamily: "Industry, sans-serif" }}>
                  Edit
                </button>
              </div>
            )}
          </SectionCard>

        </div>
      </main>
    </div>
  );
}
