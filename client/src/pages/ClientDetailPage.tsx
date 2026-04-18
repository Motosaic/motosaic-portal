import { useState } from "react";
import { MotoLogoFull } from "@/components/MotoLogo";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Client, Document } from "@shared/schema";

// ─── Constants ───────────────────────────────────────────────────────────────
const AGENTS = [
  { key: "mike_calcara",  label: "Mike Calcara",  initials: "MC", color: "#1FC3EF" },
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

// ─── Priority ranking config (mirrors IntakePage) ───────────────────────────
const PRIORITY_CATEGORIES = [
  "Interior Comfort & Luxury",
  "Exterior Style",
  "Sporty Drive / Handling",
  "Engine Power / Speed",
  "Efficiency (Gas Mileage / EV Range)",
  "Technology",
  "Safety",
  "Maintenance / Cost of Ownership",
  "Space / Storage",
  "Resale Value",
  "Warranty Coverage Beyond 3 Years",
  "Towing / Hauling Capability",
  "Off-Road Capability",
  "Brand Prestige / Status",
  "Third Row Space",
];

const RANK_COLORS: Record<string | number, { bg: string; text: string; label: string }> = {
  1: { bg: "#374151",  text: "#9ca3af",  label: "1" },
  2: { bg: "#1d4ed8",  text: "#bfdbfe",  label: "2" },
  3: { bg: "#0369a1",  text: "#7dd3fc",  label: "3" },
  4: { bg: "#15803d",  text: "#bbf7d0",  label: "4" },
  5: { bg: "#ADF029",  text: "#001f30",  label: "5" },
  na: { bg: "#1e293b", text: "rgba(255,255,255,0.35)", label: "N/A" },
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
      <div className="flex items-center gap-3 px-4 md:px-5 py-3 md:py-4 border-b"
        style={{ borderColor: accent || "rgba(255,255,255,0.07)" }}>
        <span style={{ color: accent || "var(--miami-blue)" }}>{icon}</span>
        <h3 style={{ fontWeight: 700, fontSize: 14, color: "white", letterSpacing: "0.03em" }}>{title}</h3>
      </div>
      <div className="px-4 md:px-5 py-4">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null | boolean }) {
  if (!value && value !== false) return null;
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.78)", letterSpacing: "0.08em", textTransform: "uppercase", minWidth: 90, paddingTop: 1, flexShrink: 0 }}>{label}</span>
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
    <div className="flex gap-2 md:gap-3 flex-wrap">
      {AGENTS.map(agent => {
        const active = current === agent.key;
        return (
          <button key={agent.key}
            onClick={() => mutation.mutate(active ? null : agent.key)}
            className="flex items-center gap-2 md:gap-2.5 px-3 md:px-4 py-2 md:py-2.5 rounded-xl font-bold text-sm transition-all"
            style={{
              background: active ? `${agent.color}22` : "rgba(255,255,255,0.05)",
              border: `2px solid ${active ? agent.color : "rgba(255,255,255,0.1)"}`,
              color: active ? agent.color : "rgba(255,255,255,0.5)",
              fontFamily: "Industry, sans-serif",
              minHeight: 44,
            }}>
            <div className="w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center text-xs font-black"
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
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.52)", alignSelf: "center", paddingLeft: 4 }}>
          Not assigned — tap to assign
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
    minHeight: 44,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(255,255,255,0.85)",
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
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", alignSelf: "center" }}>
                Ext: {suggestedExt}
              </span>
            )}
            {suggestedInt.map((c: string) => (
              <span key={c} style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", alignSelf: "center" }}>
                Int: {c}
              </span>
            ))}
          </div>
          {client.mustHaveFeatures && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.68)", marginTop: 8 }}>
              Must-haves: {client.mustHaveFeatures}
            </p>
          )}
        </div>
      )}

      {/* 2-col on desktop, 1-col on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      <div>
        <label style={labelStyle}>Must-Have Options / Configuration</label>
        <textarea style={{ ...fieldStyle, minHeight: 80, resize: "vertical" }}
          value={form.finalOptions} onChange={set("finalOptions")}
          placeholder="e.g. Sunroof, HUD, M Sport brakes, no sunroof delete, carbon fiber trim..." />
      </div>

      <div>
        <label style={labelStyle}>Deal Notes for Sourcing</label>
        <textarea style={{ ...fieldStyle, minHeight: 80, resize: "vertical" }}
          value={form.finalDealNotes} onChange={set("finalDealNotes")}
          placeholder="Internal notes for Mike Minerva — budget constraints, timing, dealer preferences, etc." />
      </div>

      <div className="flex items-center justify-between pt-1 gap-3">
        <p style={{ fontSize: 12, color: dirty ? "#F2EA00" : "rgba(255,255,255,0.25)" }}>
          {dirty ? "Unsaved changes" : (client.finalMake ? "Deal build saved" : "Not yet configured")}
        </p>
        <button onClick={() => mutation.mutate()} disabled={!dirty || mutation.isPending}
          className="flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-xl font-bold text-sm transition-all hover:opacity-90 disabled:opacity-40 flex-shrink-0"
          style={{ background: "var(--miami-blue)", color: "var(--shelby-blue)", fontFamily: "Industry, sans-serif", minHeight: 44 }}>
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
    return <p style={{ fontSize: 13, color: "rgba(255,255,255,0.52)" }}>No documents uploaded yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {docs.map(doc => (
        <div key={doc.id} className="flex items-center gap-3 rounded-xl px-3 md:px-4 py-3"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {/* Icon */}
          <div className="w-8 md:w-9 h-8 md:h-9 rounded-lg flex items-center justify-center flex-shrink-0"
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
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.78)" }}>
              {doc.originalName} · {fmt(doc.fileSize)}
            </p>
          </div>
          {/* Actions */}
          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
            <a href={`https://portal.motosaic.com/api/files/${doc.storedName}/download`}
              download={doc.originalName}
              className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:opacity-80"
              style={{ background: "rgba(173,240,41,0.12)", color: "var(--gelbgrun)", border: "1px solid rgba(173,240,41,0.2)", textDecoration: "none", minHeight: 36 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span className="hidden sm:inline">Download</span>
            </a>
            <button onClick={() => deleteMutation.mutate(doc.id)}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:opacity-80"
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

// ─── Intelligence helpers ─────────────────────────────────────────────────────

const HUB_STAGE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  lead:         { label: "Lead",         color: "rgba(255,255,255,0.6)",  bg: "rgba(255,255,255,0.08)" },
  discovery:    { label: "Discovery",    color: "#1FC3EF",               bg: "rgba(31,195,239,0.13)" },
  shortlist:    { label: "Shortlist",    color: "#F2EA00",               bg: "rgba(242,234,0,0.12)" },
  test_drive:   { label: "Test Drive",   color: "#ADF029",               bg: "rgba(173,240,41,0.12)" },
  negotiation:  { label: "Negotiation",  color: "#f97316",               bg: "rgba(249,115,22,0.13)" },
  closed_won:   { label: "Closed Won",   color: "#ADF029",               bg: "rgba(173,240,41,0.18)" },
  closed_lost:  { label: "Closed Lost",  color: "#ef4444",               bg: "rgba(239,68,68,0.13)" },
};

const PRIORITY_STYLES: Record<string, { bg: string; color: string }> = {
  high:   { bg: "rgba(239,68,68,0.15)",      color: "#ef4444" },
  medium: { bg: "rgba(242,234,0,0.1)",       color: "#F2EA00" },
  low:    { bg: "rgba(255,255,255,0.07)",    color: "rgba(255,255,255,0.55)" },
};

function StageBadge({ stage }: { stage?: string }) {
  const s = (stage || "").toLowerCase();
  const cfg = HUB_STAGE_LABELS[s] || { label: stage || "Unknown", color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.07)" };
  return (
    <span className="px-3 py-1 rounded-full text-xs font-black"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}44`, fontFamily: "Industry, sans-serif", letterSpacing: "0.08em", textTransform: "uppercase" }}>
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority?: string }) {
  const p = (priority || "low").toLowerCase();
  const cfg = PRIORITY_STYLES[p] || PRIORITY_STYLES.low;
  return (
    <span className="px-2 py-0.5 rounded text-xs font-bold"
      style={{ background: cfg.bg, color: cfg.color, fontFamily: "Industry, sans-serif", textTransform: "capitalize" }}>
      {p}
    </span>
  );
}

function IntelChip({ label, color }: { label: string; color?: string }) {
  const c = color || "#1FC3EF";
  return (
    <span className="px-2.5 py-1 rounded-lg text-xs font-bold"
      style={{ background: `${c}18`, color: c, border: `1px solid ${c}33` }}>
      {label}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center", lineHeight: 1.6 }}>{message}</p>
    </div>
  );
}

function IntelCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl px-4 py-3"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      {children}
    </div>
  );
}

function IntelLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.78)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, fontFamily: "Industry, sans-serif" }}>
      {children}
    </p>
  );
}

// ─── Intelligence sub-tab: Overview ──────────────────────────────────────────
function IntelOverviewTab({ intel }: { intel: any }) {
  const actionItems: any[] = intel?.action_items || [];
  const openActions = actionItems.filter((a: any) => !a.completed && !a.done);
  const openQuestions: any[] = (intel?.open_questions || []).filter((q: any) => !q.resolved && !q.answered);
  const stage: string | undefined = intel?.deal_stage || intel?.stage;

  const hasData = stage || openActions.length > 0 || openQuestions.length > 0;

  if (!hasData) {
    return <EmptyState message="Not yet analyzed. No deal stage, action items, or open questions recorded." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Deal stage */}
      {stage && (
        <IntelCard>
          <div className="flex items-center gap-3">
            <IntelLabel>Deal Stage</IntelLabel>
            <StageBadge stage={stage} />
          </div>
        </IntelCard>
      )}

      {/* Open action items */}
      {openActions.length > 0 && (
        <div>
          <IntelLabel>Open Action Items</IntelLabel>
          <div className="flex flex-col gap-2">
            {openActions.map((item: any, i: number) => (
              <IntelCard key={i}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.88)", fontWeight: 600, marginBottom: 4 }}>
                      {item.task || item.title || item.description || "Untitled action"}
                    </p>
                    {item.due_date && (
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: "Industry, sans-serif" }}>
                        Due {item.due_date}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.owner && (
                      <span className="px-2 py-0.5 rounded text-xs font-bold"
                        style={{ background: "rgba(31,195,239,0.12)", color: "#1FC3EF", border: "1px solid rgba(31,195,239,0.2)", fontFamily: "Industry, sans-serif" }}>
                        {item.owner}
                      </span>
                    )}
                    <PriorityBadge priority={item.priority} />
                  </div>
                </div>
              </IntelCard>
            ))}
          </div>
        </div>
      )}

      {/* Open questions */}
      {openQuestions.length > 0 && (
        <div>
          <IntelLabel>Open Questions</IntelLabel>
          <div className="flex flex-col gap-2">
            {openQuestions.map((q: any, i: number) => (
              <IntelCard key={i}>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.82)", lineHeight: 1.55 }}>
                  {q.question || q.text || String(q)}
                </p>
              </IntelCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Intelligence sub-tab: Meetings ──────────────────────────────────────────
function IntelMeetingsTab({ intel }: { intel: any }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const meetings: any[] = (intel?.meetings || intel?.meeting_summaries || []).slice().reverse();

  if (meetings.length === 0) {
    return <EmptyState message="No meetings recorded yet." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {meetings.map((m: any, i: number) => {
        const isOpen = expandedIdx === i;
        const actionPlan = m.action_plan || m.summary_data || {};
        const nextSteps: any[] = actionPlan.next_steps || m.next_steps || [];
        const clientNeeds: string[] = actionPlan.client_needs || m.client_needs || [];
        const crmNotes: string = actionPlan.crm_notes || m.crm_notes || "";
        const summary: string = actionPlan.summary || m.summary || m.notes || "";

        return (
          <div key={i} className="rounded-xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {/* Header row — always visible */}
            <button
              onClick={() => setExpandedIdx(isOpen ? null : i)}
              className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(31,195,239,0.12)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1FC3EF" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p style={{ fontSize: 13, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.topic || m.title || m.meeting_type || "Meeting"}
                  </p>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: "Industry, sans-serif" }}>
                    {m.date || m.created_at ? new Date(m.date || m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Date unknown"}
                    {m.duration ? ` · ${m.duration}` : ""}
                  </p>
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"
                style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {/* Expanded action plan */}
            {isOpen && (
              <div className="px-4 pb-4 flex flex-col gap-4 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                {summary && (
                  <div className="pt-3">
                    <IntelLabel>Summary</IntelLabel>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", lineHeight: 1.6 }}>{summary}</p>
                  </div>
                )}

                {clientNeeds.length > 0 && (
                  <div>
                    <IntelLabel>Client Needs</IntelLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {clientNeeds.map((need: string, ni: number) => (
                        <IntelChip key={ni} label={need} />
                      ))}
                    </div>
                  </div>
                )}

                {crmNotes && (
                  <div>
                    <IntelLabel>CRM Notes</IntelLabel>
                    <div className="rounded-lg px-3 py-2.5"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", fontFamily: "monospace" }}>
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{crmNotes}</p>
                    </div>
                  </div>
                )}

                {nextSteps.length > 0 && (
                  <div>
                    <IntelLabel>Next Steps</IntelLabel>
                    <div className="flex flex-col gap-2">
                      {nextSteps.map((step: any, si: number) => {
                        const label = typeof step === "string" ? step : (step.task || step.step || step.description || String(step));
                        const done = typeof step === "object" && (step.completed || step.done);
                        return (
                          <div key={si} className="flex items-start gap-2.5">
                            <div className="flex-shrink-0 w-4 h-4 mt-0.5 rounded border flex items-center justify-center"
                              style={{ borderColor: done ? "#ADF029" : "rgba(255,255,255,0.2)", background: done ? "rgba(173,240,41,0.15)" : "transparent" }}>
                              {done && (
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#ADF029" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                              )}
                            </div>
                            <p style={{ fontSize: 13, color: done ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.78)", lineHeight: 1.5, textDecoration: done ? "line-through" : "none" }}>
                              {label}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Intelligence sub-tab: Questionnaire ─────────────────────────────────────
function IntelQuestionnaireTab({ intel }: { intel: any }) {
  const qr = intel?.questionnaire_response || intel?.questionnaire_responses?.[0] || null;

  if (!qr) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl px-4 py-3"
          style={{ background: "rgba(31,195,239,0.06)", border: "1px solid rgba(31,195,239,0.15)" }}>
          <p style={{ fontSize: 12, color: "rgba(31,195,239,0.8)", lineHeight: 1.6 }}>
            Portal intake data is shown in the Overview tab. This shows the structured hub questionnaire if completed separately.
          </p>
        </div>
        <EmptyState message="No questionnaire submitted yet." />
      </div>
    );
  }

  const budgetMin = qr.budget_min || qr.budget?.min;
  const budgetMax = qr.budget_max || qr.budget?.max;
  const budgetRange = budgetMin || budgetMax
    ? [budgetMin ? `$${Number(budgetMin).toLocaleString()}` : null, budgetMax ? `$${Number(budgetMax).toLocaleString()}` : null].filter(Boolean).join(" – ")
    : (qr.budget_range || qr.budget || null);

  const bodyStyles: string[] = Array.isArray(qr.body_styles) ? qr.body_styles : (qr.body_styles ? [qr.body_styles] : []);
  const mustHave: string[] = Array.isArray(qr.must_have_features) ? qr.must_have_features : (qr.must_have_features ? [qr.must_have_features] : []);
  const niceToHave: string[] = Array.isArray(qr.nice_to_have_features) ? qr.nice_to_have_features : (qr.nice_to_have_features ? [qr.nice_to_have_features] : []);

  return (
    <div className="flex flex-col gap-4">
      {/* Note about portal intake */}
      <div className="rounded-xl px-4 py-3"
        style={{ background: "rgba(31,195,239,0.06)", border: "1px solid rgba(31,195,239,0.15)" }}>
        <p style={{ fontSize: 12, color: "rgba(31,195,239,0.8)", lineHeight: 1.6 }}>
          Portal intake data is shown in the Overview tab. This shows the structured hub questionnaire if completed separately.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {budgetRange && (
          <IntelCard>
            <IntelLabel>Budget Range</IntelLabel>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#ADF029" }}>{budgetRange}</p>
          </IntelCard>
        )}

        {bodyStyles.length > 0 && (
          <IntelCard>
            <IntelLabel>Preferred Body Styles</IntelLabel>
            <div className="flex flex-wrap gap-1.5">
              {bodyStyles.map((s, i) => <IntelChip key={i} label={s} />)}
            </div>
          </IntelCard>
        )}

        {mustHave.length > 0 && (
          <IntelCard>
            <IntelLabel>Must-Have Features</IntelLabel>
            <div className="flex flex-wrap gap-1.5">
              {mustHave.map((f, i) => <IntelChip key={i} label={f} color="#ADF029" />)}
            </div>
          </IntelCard>
        )}

        {niceToHave.length > 0 && (
          <IntelCard>
            <IntelLabel>Nice-to-Have Features</IntelLabel>
            <div className="flex flex-wrap gap-1.5">
              {niceToHave.map((f, i) => <IntelChip key={i} label={f} color="rgba(255,255,255,0.6)" />)}
            </div>
          </IntelCard>
        )}

        {qr.use_case && (
          <IntelCard>
            <IntelLabel>Use Case</IntelLabel>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.82)" }}>{qr.use_case}</p>
          </IntelCard>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {qr.timeline != null && (
            <IntelCard>
              <IntelLabel>Timeline</IntelLabel>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.82)", fontWeight: 600 }}>{qr.timeline}</p>
            </IntelCard>
          )}
          {qr.has_trade_in != null && (
            <IntelCard>
              <IntelLabel>Trade-In</IntelLabel>
              <p style={{ fontSize: 13, fontWeight: 700, color: qr.has_trade_in ? "#ADF029" : "rgba(255,255,255,0.82)" }}>
                {qr.has_trade_in ? "Yes" : "No"}
              </p>
            </IntelCard>
          )}
          {qr.financing_needed != null && (
            <IntelCard>
              <IntelLabel>Financing</IntelLabel>
              <p style={{ fontSize: 13, fontWeight: 700, color: qr.financing_needed ? "#1FC3EF" : "rgba(255,255,255,0.82)" }}>
                {qr.financing_needed ? "Yes" : "No"}
              </p>
            </IntelCard>
          )}
        </div>

        {qr.notes && (
          <IntelCard>
            <IntelLabel>Notes</IntelLabel>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.78)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{qr.notes}</p>
          </IntelCard>
        )}
      </div>
    </div>
  );
}

// ─── Intelligence Tab container ───────────────────────────────────────────────
function IntelligenceTab({ clientId }: { clientId: string }) {
  const [subTab, setSubTab] = useState<"overview" | "meetings" | "questionnaire">("overview");

  const { data: intel, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/clients", clientId, "intelligence"],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/intelligence`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: "#1FC3EF", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (isError || !intel) {
    return (
      <div className="flex items-center justify-center py-16">
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center", lineHeight: 1.7, maxWidth: 380 }}>
          No intelligence data found. This client may not have a hub record yet — their email needs to match.
        </p>
      </div>
    );
  }

  if (intel.not_found) {
    return (
      <div className="flex items-center justify-center py-16">
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center", lineHeight: 1.7, maxWidth: 380 }}>
          No intelligence data found. This client may not have a hub record yet — their email needs to match.
        </p>
      </div>
    );
  }

  const SUB_TABS = [
    { key: "overview" as const,       label: "Overview" },
    { key: "meetings" as const,       label: "Meetings" },
    { key: "questionnaire" as const,  label: "Questionnaire" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tab bar */}
      <div className="flex gap-1 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {SUB_TABS.map(t => (
          <button key={t.key}
            onClick={() => setSubTab(t.key)}
            className="flex-1 py-2 rounded-lg text-xs font-black transition-all"
            style={{
              fontFamily: "Industry, sans-serif",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: subTab === t.key ? "rgba(31,195,239,0.15)" : "transparent",
              color: subTab === t.key ? "#1FC3EF" : "rgba(255,255,255,0.45)",
              border: subTab === t.key ? "1px solid rgba(31,195,239,0.25)" : "1px solid transparent",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {subTab === "overview"      && <IntelOverviewTab intel={intel} />}
      {subTab === "meetings"      && <IntelMeetingsTab intel={intel} />}
      {subTab === "questionnaire" && <IntelQuestionnaireTab intel={intel} />}
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
  const [activeTab, setActiveTab] = useState<"overview" | "questionnaire" | "documents" | "deal" | "intelligence">("overview");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

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

  const { data: pageIntel } = useQuery<any>({
    queryKey: ["/api/clients", id, "intelligence"],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${id}/intelligence`);
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
    enabled: !!id,
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

  const bodyStyles       = parseJson(client.bodyStyles);
  const preferredMakes   = parseJson(client.preferredMakes);
  const notInterestedMakes = parseJson(client.notInterestedMakes);
  const intColors        = parseJson(client.interiorColors);
  const householdVehicles: Array<{ year?: string; make?: string; model?: string; trim?: string }> = (() => {
    try { return JSON.parse(client.householdVehicles || "[]"); } catch { return []; }
  })();
  const priorityRankings: Record<string, string | number> = (() => {
    try { return JSON.parse(client.priorityRankings || "{}"); } catch { return {}; }
  })();
  const assignedAgent = AGENTS.find(a => a.key === client.assignedTo);
  const dealComplete  = !!(client.finalMake && client.finalModel);

  return (
    <div className="min-h-screen flex" style={{ background: "#001520" }}>

      {/* ── Desktop Sidebar (hidden on mobile) ── */}
      <aside className="hidden lg:flex flex-col w-56 flex-shrink-0 px-4 py-6 border-r"
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
      <main className="flex-1 overflow-y-auto min-w-0">

        {/* Header */}
        <header className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5 border-b sticky top-0 z-10 gap-3"
          style={{ borderColor: "rgba(255,255,255,0.08)", background: "#001520" }}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Mobile back button */}
            <button
              onClick={() => navigate("/admin")}
              className="lg:hidden flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
              data-testid="btn-back-to-clients"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>

            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: assignedAgent ? `${assignedAgent.color}22` : "rgba(31,195,239,0.15)" }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: assignedAgent?.color || "var(--miami-blue)" }}>
                {client.firstName[0]}{client.lastName[0]}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 style={{ fontSize: 17, fontWeight: 900, color: "white" }}>
                  {client.firstName} {client.lastName}
                </h1>
                {assignedAgent && (
                  <span className="hidden sm:inline px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{ background: `${assignedAgent.color}22`, color: assignedAgent.color, border: `1px solid ${assignedAgent.color}44` }}>
                    {assignedAgent.label}
                  </span>
                )}
                {dealComplete && (
                  <span className="hidden sm:inline px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{ background: "rgba(173,240,41,0.12)", color: "var(--gelbgrun)", border: "1px solid rgba(173,240,41,0.25)" }}>
                    Deal Built
                  </span>
                )}
              </div>
              <p className="hidden sm:block" style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {client.email} · {client.phone}
                {client.city && ` · ${client.city}, ${client.state}`}
              </p>
            </div>
          </div>

          {/* Status selector */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {client.driveFolder && (
              <a href={client.driveFolder} target="_blank" rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl font-bold text-sm transition-all hover:opacity-80"
                style={{ background: "rgba(173,240,41,0.1)", color: "var(--gelbgrun)", border: "1px solid rgba(173,240,41,0.2)", textDecoration: "none", minHeight: 38 }}>
                <span className="hidden md:inline">Open Drive</span>
                <span className="sm:hidden md:hidden">Drive</span>
              </a>
            )}
            <select value={client.status || "new"} onChange={e => statusMutation.mutate(e.target.value)}
              className="rounded-xl px-2 md:px-3 py-2 text-xs font-bold cursor-pointer"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)", fontFamily: "Industry, sans-serif", minHeight: 38 }}>
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </header>

        {/* ── Main tab bar ── */}
        <div className="px-4 md:px-8 pt-4 flex gap-1 overflow-x-auto" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {([
            { key: "overview",      label: "Overview" },
            { key: "questionnaire", label: "Questionnaire" },
            { key: "documents",     label: "Documents" },
            { key: "deal",          label: "Deal Build" },
            { key: "intelligence",  label: "Intelligence" },
          ] as const).map(tab => (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="px-4 py-2.5 text-xs font-black whitespace-nowrap transition-all flex-shrink-0"
              style={{
                fontFamily: "Industry, sans-serif",
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: activeTab === tab.key ? "#1FC3EF" : "rgba(255,255,255,0.4)",
                borderBottom: activeTab === tab.key ? "2px solid #1FC3EF" : "2px solid transparent",
                background: "transparent",
                marginBottom: -1,
                ...(tab.key === "intelligence" ? { color: activeTab === "intelligence" ? "#1FC3EF" : "rgba(173,240,41,0.7)" } : {}),
              }}>
              {tab.key === "intelligence" && (
                <span style={{ marginRight: 4, opacity: 0.85 }}>&#9889;</span>
              )}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Page body ── */}
        <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col gap-4 md:gap-5 max-w-5xl pb-24 lg:pb-6">

          {/* ── INTELLIGENCE TAB ── */}
          {activeTab === "intelligence" && (
            <IntelligenceTab clientId={id} />
          )}

          {/* ── OVERVIEW TAB ── */}
          {activeTab === "overview" && (<>

          {/* 1. ASSIGNMENT */}
          <SectionCard title="Deal Assignment" accent="rgba(31,195,239,0.25)" icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          }>
            <AssigneePicker clientId={client.id} current={client.assignedTo} onChange={refresh} />
          </SectionCard>

          {/* AI BRIEF — only shown when intel data exists */}
          {pageIntel && !pageIntel.not_found && (() => {
            const latestPlan = pageIntel.meetings?.find((m: any) => m.action_plan)?.action_plan;
            if (!latestPlan) return null;
            return (
              <SectionCard
                title="AI Brief"
                accent="rgba(31,195,239,0.25)"
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1FC3EF" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                }
              >
                {/* Summary */}
                {latestPlan.summary && (
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.82)", lineHeight: 1.6, marginBottom: 12 }}>
                    {latestPlan.summary}
                  </p>
                )}
                {/* Client needs as pills */}
                {Array.isArray(latestPlan.client_needs) && latestPlan.client_needs.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Key Needs</p>
                    <div className="flex flex-col gap-1.5">
                      {latestPlan.client_needs.map((need: string, i: number) => (
                        <div key={i} className="flex items-start gap-2">
                          <span style={{ color: "#1FC3EF", fontSize: 14, lineHeight: 1, marginTop: 2, flexShrink: 0 }}>&#x203A;</span>
                          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>{need}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Open questions */}
                {Array.isArray(pageIntel.deal_snapshot?.open_questions) && pageIntel.deal_snapshot.open_questions.length > 0 && (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Open Questions</p>
                    <div className="flex flex-col gap-1.5">
                      {pageIntel.deal_snapshot.open_questions.slice(0, 3).map((q: string, i: number) => (
                        <div key={i} className="flex items-start gap-2">
                          <span style={{ color: "rgba(255,200,0,0.8)", fontSize: 12, lineHeight: 1, marginTop: 2, flexShrink: 0 }}>?</span>
                          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>{q}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </SectionCard>
            );
          })()}

          {/* WHAT'S NEXT — only shown when intel data has checklist items */}
          {pageIntel && !pageIntel.not_found && (() => {
            const nextSteps = pageIntel.deal_snapshot?.next_steps ?? [];
            if (nextSteps.length === 0) return null;
            return (
              <SectionCard
                title="What's Next"
                accent="rgba(173,240,41,0.2)"
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ADF029" strokeWidth="2">
                    <polyline points="9 11 12 14 22 4"/>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  </svg>
                }
              >
                <div className="flex flex-col gap-2">
                  {nextSteps.slice(0, 6).map((item: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex-shrink-0 rounded-full flex items-center justify-center mt-0.5"
                        style={{ width: 18, height: 18, background: "rgba(173,240,41,0.12)", border: "1px solid rgba(173,240,41,0.25)" }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#ADF029" strokeWidth="3">
                          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                      </div>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
                        {typeof item === "string" ? item : item.step}
                      </span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            );
          })()}

          {/* 2. CLIENT SNAPSHOT */}
          <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <SectionCard title="Client Overview" icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              }>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
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

            {/* Document checklist */}
            <SectionCard title="Documents" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <polyline points="9 15 11 17 15 13"/>
              </svg>
            }>
              {(() => {
                const docChecklist = [
                  { key: "drivers_license_front", label: "DL — Front" },
                  { key: "drivers_license_back",  label: "DL — Back" },
                  { key: "proof_of_insurance",    label: "Current Insurance" },
                  { key: "insurance_id_card",     label: "Updated Insurance" },
                ];
                return (
                  <div className="flex flex-col gap-2">
                    {docChecklist.map(({ key, label }) => {
                      const uploaded = docs.some(d => d.docType === key);
                      return (
                        <div key={key} className="flex items-center gap-2.5 rounded-lg px-3 py-2"
                          style={{ background: uploaded ? "rgba(173,240,41,0.07)" : "rgba(255,255,255,0.04)", border: `1px solid ${uploaded ? "rgba(173,240,41,0.2)" : "rgba(255,255,255,0.08)"}` }}>
                          <div className="flex-shrink-0 rounded-full flex items-center justify-center"
                            style={{ width: 20, height: 20, background: uploaded ? "rgba(173,240,41,0.2)" : "rgba(255,255,255,0.08)" }}>
                            {uploaded ? (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ADF029" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            ) : (
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5">
                                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                              </svg>
                            )}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: uploaded ? "rgba(173,240,41,0.9)" : "rgba(255,255,255,0.4)" }}>
                            {label}
                          </span>
                        </div>
                      );
                    })}
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.68)", marginTop: 4, textAlign: "right" }}>
                      {docs.filter(d => ["drivers_license_front","drivers_license_back","proof_of_insurance","insurance_id_card"].includes(d.docType)).length} / 4 uploaded
                    </p>
                  </div>
                );
              })()}
            </SectionCard>

            {/* Vehicle wish list — full width */}
            <div className="lg:col-span-3">
              <SectionCard title="What They Want" icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 1 1 4.93 19.07"/>
                </svg>
              }>
                <div className="flex flex-col gap-3">
                  {preferredMakes.length > 0 && (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.78)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Makes</p>
                      <div className="flex flex-wrap gap-1.5">
                        {preferredMakes.map((m: string) => <Pill key={m} label={m} />)}
                      </div>
                    </div>
                  )}
                  {bodyStyles.length > 0 && (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.78)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Body Style</p>
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
                  {client.niceToHaveFeatures && (
                    <Row label="Nice-to-Have" value={client.niceToHaveFeatures} />
                  )}
                  {client.preferredModels && (
                    <Row label="Models" value={client.preferredModels} />
                  )}
                  {notInterestedMakes.length > 0 && (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.78)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Not Interested</p>
                      <div className="flex flex-wrap gap-1.5">
                        {notInterestedMakes.map((m: string) => (
                          <span key={m} className="px-2.5 py-1 rounded-lg text-xs font-bold"
                            style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <Row label="Powertrain" value={client.powertrain} />
                  {client.powertrain?.toLowerCase().includes("ev") || client.powertrain?.toLowerCase().includes("electric") ? (
                    <Row label="EV Long Range" value={client.evLongRange ? "Yes" : "No"} />
                  ) : null}
                  <Row label="Annual Miles" value={client.annualMileage} />
                  <Row label="Passengers" value={client.passengerCount} />
                  {client.suvSeatConfig && <Row label="SUV Seats" value={client.suvSeatConfig} />}
                  {client.suvMaxSeating && <Row label="Max Seating" value={client.suvMaxSeating} />}
                  {client.suvNumChildren && <Row label="# Children" value={String(client.suvNumChildren)} />}
                  {client.suvChildAges && <Row label="Child Ages" value={client.suvChildAges} />}
                  {client.suvHasPets !== undefined && client.suvHasPets !== null && (
                    <Row label="Has Pets" value={client.suvHasPets ? "Yes" : "No"} />
                  )}
                </div>
              </SectionCard>
            </div>
          </div>

          {/* 3. LIFESTYLE & PERKS */}
          {(client.costcoMembership || client.isVeteran || householdVehicles.filter(v => v.year || v.make || v.model).length > 0) && (
            <SectionCard title="Lifestyle & Perks" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            }>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                <div>
                  <Row label="Costco Member" value={client.costcoMembership ? "Yes" : undefined} />
                  <Row label="Veteran" value={client.isVeteran ? "Yes" : undefined} />
                </div>
              </div>
              {householdVehicles.filter(v => v.year || v.make || v.model).length > 0 && (
                <div className="mt-3">
                  <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.78)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Household Vehicles</p>
                  <div className="flex flex-col gap-2">
                    {householdVehicles.filter(v => v.year || v.make || v.model).map((v, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.52)", minWidth: 20 }}>#{i + 1}</span>
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.82)" }}>
                          {[v.year, v.make, v.model, v.trim].filter(Boolean).join(" ")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* 4. PRIORITY RANKINGS */}
          {Object.keys(priorityRankings).length > 0 && (
            <SectionCard title="Priority Rankings" accent="rgba(173,240,41,0.2)" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ADF029" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            }>
              <div className="flex flex-col gap-2">
                {([5,4,3,2,1] as const).map(rank => {
                  const cats = PRIORITY_CATEGORIES.filter(c => priorityRankings[c] === rank);
                  if (cats.length === 0) return null;
                  const rc = RANK_COLORS[rank];
                  return (
                    <div key={rank} className="flex items-start gap-3">
                      <span className="flex-shrink-0 px-2 py-0.5 rounded-md text-xs font-black"
                        style={{ background: rc.bg, color: rc.text, minWidth: 28, textAlign: "center" }}>
                        {rank}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {cats.map(c => (
                          <span key={c} className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                            style={{ background: `${rc.bg}33`, color: rc.text, border: `1px solid ${rc.bg}88` }}>
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {(() => {
                  const naCats = PRIORITY_CATEGORIES.filter(c => priorityRankings[c] === "na");
                  if (naCats.length === 0) return null;
                  const rc = RANK_COLORS["na"];
                  return (
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 px-2 py-0.5 rounded-md text-xs font-black"
                        style={{ background: rc.bg, color: rc.text, minWidth: 28, textAlign: "center" }}>
                        N/A
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {naCats.map(c => (
                          <span key={c} className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}>
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-3 mt-4 pt-3 flex-wrap" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.52)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Scale:</span>
                {([1,2,3,4,5] as const).map(r => {
                  const rc = RANK_COLORS[r];
                  return (
                    <span key={r} className="px-2 py-0.5 rounded text-xs font-bold"
                      style={{ background: rc.bg, color: rc.text }}>
                      {r} {r === 1 ? "— Low" : r === 5 ? "— High" : ""}
                    </span>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* 5. NOTES */}
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
                    style={{ background: "var(--miami-blue)", color: "var(--shelby-blue)", fontFamily: "Industry, sans-serif", minHeight: 44 }}>
                    Save Notes
                  </button>
                  <button onClick={() => setEditingNotes(false)}
                    className="px-4 py-2 rounded-xl text-sm font-bold"
                    style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.82)", fontFamily: "Industry, sans-serif", minHeight: 44 }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <p style={{ fontSize: 13, color: client.notes ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)", lineHeight: 1.6, whiteSpace: "pre-wrap", flex: 1 }}>
                  {client.notes || "No notes yet — tap Edit to add internal notes."}
                </p>
                <button onClick={() => setEditingNotes(true)}
                  className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold"
                  style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.92)", border: "1px solid rgba(255,255,255,0.1)", fontFamily: "Industry, sans-serif", minHeight: 38 }}>
                  Edit
                </button>
              </div>
            )}
          </SectionCard>

          </>)}

          {/* ── QUESTIONNAIRE TAB ── */}
          {activeTab === "questionnaire" && (
            <SectionCard title="Client Questionnaire" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
            }>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                <div>
                  <Row label="Name"      value={`${client.firstName} ${client.lastName}`} />
                  <Row label="Purchase"  value={client.purchaseType} />
                  <Row label="Budget"    value={client.budget} />
                  <Row label="Down Pmt"  value={client.downPayment} />
                  <Row label="Monthly"   value={client.monthlyPayment} />
                  <Row label="Credit"    value={client.creditScore} />
                  <Row label="Timeframe" value={client.timeframe} />
                </div>
                <div>
                  {preferredMakes.length > 0 && (
                    <div className="mb-3">
                      <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.78)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Preferred Makes</p>
                      <div className="flex flex-wrap gap-1.5">
                        {preferredMakes.map((m: string) => <Pill key={m} label={m} />)}
                      </div>
                    </div>
                  )}
                  {bodyStyles.length > 0 && (
                    <div className="mb-3">
                      <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.78)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Body Styles</p>
                      <div className="flex flex-wrap gap-1.5">
                        {bodyStyles.map((s: string) => <Pill key={s} label={s} />)}
                      </div>
                    </div>
                  )}
                  <Row label="Must-Have"     value={client.mustHaveFeatures} />
                  <Row label="Nice-to-Have"  value={client.niceToHaveFeatures} />
                  <Row label="Annual Miles"  value={client.annualMileage} />
                  <Row label="Powertrain"    value={client.powertrain} />
                  <Row label="Trade-In"      value={client.hasTradeIn ? "Yes" : "No"} />
                </div>
              </div>
              {client.hasTradeIn && (
                <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.78)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Trade-In Vehicle</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
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
                </div>
              )}
            </SectionCard>
          )}

          {/* ── DOCUMENTS TAB ── */}
          {activeTab === "documents" && (
            <SectionCard title={`Client Documents (${docs.length})`} icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            }>
              <DocPanel docs={docs} clientId={id} />
            </SectionCard>
          )}

          {/* ── DEAL BUILD TAB ── */}
          {activeTab === "deal" && (
            <SectionCard title="Final Vehicle Build" accent="rgba(242,234,0,0.3)" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F2EA00" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 1 1 4.93 19.07"/>
              </svg>
            }>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginBottom: 16 }}>
                Complete this section to send the deal to Mike Minerva for sourcing. Pre-populated with client preferences — adjust as needed.
              </p>
              <DealBuilder client={client} onSave={refresh} />
            </SectionCard>
          )}

        </div>
      </main>

      {/* ── Mobile bottom tab bar (hidden on lg+) ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch border-t"
        style={{ background: "#001a28", borderColor: "rgba(255,255,255,0.1)", height: 60 }}>
        <button
          onClick={() => navigate("/admin")}
          className="flex-1 flex flex-col items-center justify-center gap-1 transition-all"
          style={{ color: "rgba(255,255,255,0.85)" }}
          data-testid="tab-back-clients"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "Industry, sans-serif", letterSpacing: "0.06em" }}>Clients</span>
        </button>

        <button
          className="flex-1 flex flex-col items-center justify-center gap-1"
          style={{ color: "var(--miami-blue)" }}
          data-testid="tab-detail-active"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "Industry, sans-serif", letterSpacing: "0.06em" }}>Detail</span>
        </button>

        <button
          onClick={() => navigate(`/documents/${id}`)}
          className="flex-1 flex flex-col items-center justify-center gap-1 transition-all"
          style={{ color: "rgba(255,255,255,0.85)" }}
          data-testid="tab-docs"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "Industry, sans-serif", letterSpacing: "0.06em" }}>Docs</span>
        </button>
      </nav>

      {/* ── Floating Client Chat ───────────────────────────────────────────── */}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 1000 }}>
        {/* Chat panel */}
        {chatOpen && (
          <div style={{
            position: "absolute", bottom: 64, right: 0,
            width: 360, maxHeight: 520,
            background: "#001f30", border: "1px solid rgba(31,195,239,0.25)",
            borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          }}>
            {/* Header */}
            <div style={{
              padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "rgba(31,195,239,0.08)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1FC3EF" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", fontFamily: "Industry, sans-serif", letterSpacing: "0.04em" }}>
                  ASK ABOUT {`${client.firstName} ${client.lastName}`.toUpperCase()}
                </span>
              </div>
              <button onClick={() => setChatOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", padding: 2 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, minHeight: 200, maxHeight: 360 }}>
              {chatHistory.length === 0 && (
                <div style={{ textAlign: "center", marginTop: 24 }}>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
                    Ask anything about this client — their vehicle preferences, budget, next steps, open questions, or anything from your meeting notes.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
                    {["What car are they looking for?", "What are the open questions?", "What's the next step?"].map(q => (
                      <button key={q} onClick={() => { setChatInput(q); }}
                        style={{
                          background: "rgba(31,195,239,0.07)", border: "1px solid rgba(31,195,239,0.2)",
                          borderRadius: 8, padding: "6px 12px", cursor: "pointer",
                          fontSize: 11, color: "rgba(255,255,255,0.6)", textAlign: "left",
                        }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatHistory.map((msg, i) => (
                <div key={i} style={{
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                }}>
                  <div style={{
                    padding: "8px 12px", borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    background: msg.role === "user" ? "rgba(31,195,239,0.15)" : "rgba(255,255,255,0.06)",
                    border: `1px solid ${msg.role === "user" ? "rgba(31,195,239,0.25)" : "rgba(255,255,255,0.08)"}`,
                    fontSize: 12, color: "rgba(255,255,255,0.85)", lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ alignSelf: "flex-start" }}>
                  <div style={{
                    padding: "8px 14px", borderRadius: "12px 12px 12px 2px",
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                  }}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      {[0,1,2].map(i => (
                        <div key={i} style={{
                          width: 6, height: 6, borderRadius: "50%", background: "#1FC3EF",
                          animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                          opacity: 0.6,
                        }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 8 }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === "Enter" && !e.shiftKey && chatInput.trim() && !chatLoading) {
                    e.preventDefault();
                    const userMsg = chatInput.trim();
                    setChatInput("");
                    const newHistory = [...chatHistory, { role: "user" as const, content: userMsg }];
                    setChatHistory(newHistory);
                    setChatLoading(true);
                    try {
                      const res = await fetch(`/api/clients/${client.id}/chat`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ message: userMsg, history: chatHistory }),
                      });
                      const data = await res.json();
                      setChatHistory([...newHistory, { role: "assistant", content: data.reply ?? "Sorry, something went wrong." }]);
                    } catch {
                      setChatHistory([...newHistory, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
                    } finally {
                      setChatLoading(false);
                    }
                  }
                }}
                placeholder="Ask anything about this client…"
                style={{
                  flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "rgba(255,255,255,0.85)",
                  outline: "none", fontFamily: "inherit",
                }}
              />
              <button
                disabled={!chatInput.trim() || chatLoading}
                onClick={async () => {
                  const userMsg = chatInput.trim();
                  if (!userMsg || chatLoading) return;
                  setChatInput("");
                  const newHistory = [...chatHistory, { role: "user" as const, content: userMsg }];
                  setChatHistory(newHistory);
                  setChatLoading(true);
                  try {
                    const res = await fetch(`/api/clients/${client.id}/chat`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ message: userMsg, history: chatHistory }),
                    });
                    const data = await res.json();
                    setChatHistory([...newHistory, { role: "assistant", content: data.reply ?? "Sorry, something went wrong." }]);
                  } catch {
                    setChatHistory([...newHistory, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
                  } finally {
                    setChatLoading(false);
                  }
                }}
                style={{
                  background: chatInput.trim() && !chatLoading ? "#1FC3EF" : "rgba(31,195,239,0.2)",
                  border: "none", borderRadius: 8, padding: "8px 12px", cursor: chatInput.trim() && !chatLoading ? "pointer" : "default",
                  display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={chatInput.trim() && !chatLoading ? "#001f30" : "rgba(31,195,239,0.5)"} strokeWidth="2.5">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Toggle button */}
        <button
          onClick={() => setChatOpen(o => !o)}
          style={{
            width: 52, height: 52, borderRadius: "50%",
            background: chatOpen ? "rgba(31,195,239,0.2)" : "#1FC3EF",
            border: chatOpen ? "2px solid #1FC3EF" : "none",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 20px rgba(31,195,239,0.4)", transition: "all 0.2s",
          }}
        >
          {chatOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1FC3EF" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#001f30" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
