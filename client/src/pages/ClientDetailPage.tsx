import { useState } from "react";
import { MotoLogoFull } from "@/components/MotoLogo";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Client, Document } from "@shared/schema";

const DOC_TYPE_LABELS: Record<string, string> = {
  drivers_license_front: "Driver's License — Front",
  drivers_license_back: "Driver's License — Back",
  insurance: "Insurance Card",
  income: "Proof of Income",
  registration: "Current Registration",
  other: "Other Document",
};

function InfoRow({ label, value }: { label: string; value?: string | null | boolean }) {
  if (!value && value !== false) return null;
  return (
    <div className="flex items-start gap-3">
      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", textTransform: "uppercase", minWidth: 130, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", flex: 1 }}>{String(value)}</span>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
      <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <span style={{ color: "var(--miami-blue)" }}>{icon}</span>
        <h3 style={{ fontWeight: 700, fontSize: 14, color: "white" }}>{title}</h3>
      </div>
      <div className="px-5 py-4 flex flex-col gap-3">{children}</div>
    </div>
  );
}

function DriveButton({ clientId, client, onSync }: { clientId: number; client: Client; onSync: (url: string) => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleSync = async () => {
    setLoading(true);
    try {
      // Build a Drive deep-link (opens Google Drive to create/view folder)
      const folderName = encodeURIComponent(`Motosaic - ${client.firstName} ${client.lastName}`);
      const searchUrl = `https://drive.google.com/drive/search?q=${folderName}`;
      // Record the Drive folder URL in the DB
      await apiRequest("PATCH", `/api/clients/${clientId}/drive-folder`, { driveFolder: searchUrl });
      onSync(searchUrl);
      toast({
        title: "Drive folder linked",
        description: "Opening Google Drive — create a folder named '" + `Motosaic - ${client.firstName} ${client.lastName}` + "' to organize this client's files.",
      });
      window.open(searchUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast({ title: "Failed to sync", description: "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (client.driveFolder) {
    return (
      <a href={client.driveFolder} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all hover:opacity-80"
        style={{ background: "rgba(173,240,41,0.12)", color: "var(--gelbgrun)", border: "1px solid rgba(173,240,41,0.25)", fontFamily: "Industry, sans-serif", textDecoration: "none" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Open Drive Folder
      </a>
    );
  }

  return (
    <button onClick={handleSync} disabled={loading} data-testid="btn-drive-sync"
      className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all hover:opacity-90 disabled:opacity-50"
      style={{ background: "rgba(31,195,239,0.15)", color: "var(--miami-blue)", border: "1px solid rgba(31,195,239,0.25)", fontFamily: "Industry, sans-serif" }}>
      {loading ? (
        <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "var(--miami-blue)", borderTopColor: "transparent" }} />
      ) : (
        <svg width="14" height="14" viewBox="0 0 87.3 78" fill="currentColor">
          <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
          <path d="M43.65 25 29.9 0c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z" fill="#00ac47"/>
          <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.65 10.45z" fill="#ea4335"/>
          <path d="M43.65 25 57.4 0H13.9c-1.55 0-3.1.4-4.5 1.2z" fill="#00832d"/>
          <path d="M59.8 53H27.5L13.75 76.8c1.4.8 2.95 1.2 4.5 1.2h50.8c1.55 0 3.1-.4 4.5-1.2z" fill="#2684fc"/>
          <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
        </svg>
      )}
      {loading ? "Syncing..." : "Sync to Google Drive"}
    </button>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);

  const { data: client, isLoading } = useQuery<Client>({
    queryKey: ["/api/clients", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/clients/${id}`);
      if (!res.ok) throw new Error("Not found");
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", id] });
      setEditingNotes(false);
      toast({ title: "Notes saved" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => apiRequest("PATCH", `/api/clients/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/clients", id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: number) => apiRequest("DELETE", `/api/documents/${docId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/clients", id, "documents"] }),
  });

  const handleDriveSync = (url: string) => {
    queryClient.invalidateQueries({ queryKey: ["/api/clients", id] });
  };

  if (isLoading || !client) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#001f30" }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: "var(--miami-blue)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const bodyStyles = (() => { try { return JSON.parse(client.bodyStyles || "[]"); } catch { return []; } })();
  const preferredMakes = (() => { try { return JSON.parse(client.preferredMakes || "[]"); } catch { return []; } })();

  return (
    <div className="min-h-screen flex" style={{ background: "#001f30" }}>
      {/* Sidebar */}
      <aside className="flex flex-col w-56 flex-shrink-0 px-4 py-6 border-r" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="mb-8">
          <MotoLogoFull height={32} />
        </div>
        <nav className="flex flex-col gap-1">
          <span className="sidebar-nav-item" onClick={() => navigate("/admin")} data-testid="nav-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            All Clients
          </span>
          <span className="sidebar-nav-item active">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Client Detail
          </span>
          <span className="sidebar-nav-item" onClick={() => navigate(`/intake/${id}/upload`)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload Docs
          </span>
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="flex items-center justify-between px-8 py-5 border-b sticky top-0 z-10"
          style={{ borderColor: "rgba(255,255,255,0.08)", background: "#001f30" }}>
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{ background: "rgba(31,195,239,0.2)" }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: "var(--miami-blue)" }}>
                {client.firstName[0]}{client.lastName[0]}
              </span>
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: "white" }}>
                {client.firstName} {client.lastName}
              </h1>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                {client.email} · Added {new Date(client.createdAt || "").toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DriveButton clientId={parseInt(id)} client={client} onSync={handleDriveSync} />
            <select
              value={client.status || "new"}
              onChange={e => statusMutation.mutate(e.target.value)}
              data-testid="select-status"
              className="rounded-xl px-3 py-2 text-xs font-bold cursor-pointer"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.8)",
                fontFamily: "Industry, sans-serif",
              }}>
              {[["new","New"],["in_progress","In Progress"],["ready","Ready"],["closed","Closed"]].map(([v,l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </header>

        <div className="px-8 py-6 grid grid-cols-2 gap-5">
          {/* Left column */}
          <div className="flex flex-col gap-5">
            {/* Personal Info */}
            <Section title="Personal Information" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            }>
              <InfoRow label="Name" value={`${client.firstName} ${client.lastName}`} />
              <InfoRow label="Email" value={client.email} />
              <InfoRow label="Phone" value={client.phone} />
              {client.address && <InfoRow label="Address" value={`${client.address}, ${client.city}, ${client.state} ${client.zip}`} />}
            </Section>

            {/* Budget */}
            <Section title="Budget & Financing" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            }>
              <InfoRow label="Purchase Type" value={client.purchaseType} />
              <InfoRow label="Total Budget" value={client.budget} />
              <InfoRow label="Down Payment" value={client.downPayment} />
              <InfoRow label="Monthly Target" value={client.monthlyPayment} />
              <InfoRow label="Credit Score" value={client.creditScore} />
              <InfoRow label="Timeframe" value={client.timeframe} />
            </Section>

            {/* Trade-in */}
            {client.hasTradeIn && (
              <Section title="Trade-In Vehicle" icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                  <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
              }>
                <InfoRow label="Vehicle" value={`${client.tradeYear} ${client.tradeMake} ${client.tradeModel} ${client.tradeTrim || ""}`} />
                <InfoRow label="Mileage" value={client.tradeMileage} />
                <InfoRow label="Condition" value={client.tradeCondition} />
                <InfoRow label="Amount Owed" value={client.tradeOwed} />
              </Section>
            )}
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-5">
            {/* Vehicle Preferences */}
            <Section title="Vehicle Preferences" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 17H5c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2z"/>
                <circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>
              </svg>
            }>
              <InfoRow label="Condition" value={client.vehicleCondition} />
              {bodyStyles.length > 0 && <InfoRow label="Body Styles" value={bodyStyles.join(", ")} />}
              {preferredMakes.length > 0 && <InfoRow label="Makes" value={preferredMakes.join(", ")} />}
              <InfoRow label="Models" value={client.preferredModels} />
              <InfoRow label="Year Range" value={client.yearMin && client.yearMax ? `${client.yearMin} – ${client.yearMax}` : undefined} />
              <InfoRow label="Max Mileage" value={client.maxMileage} />
              <InfoRow label="Must-Have" value={client.mustHaveFeatures} />
              <InfoRow label="Nice-to-Have" value={client.niceToHaveFeatures} />
              <InfoRow label="Colors" value={client.colorPreferences} />
            </Section>

            {/* Documents */}
            <Section title={`Documents (${docs.length})`} icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            }>
              {docs.length === 0 ? (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>No documents uploaded yet.</p>
              ) : (
                docs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(31,195,239,0.12)" }}>
                      {doc.mimeType.includes("pdf") ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--miami-blue)" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--miami-blue)" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {DOC_TYPE_LABELS[doc.docType] || doc.docType}
                      </p>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                        {doc.originalName} · {formatBytes(doc.fileSize)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a href={`/api/files/${doc.storedName}/download`}
                        target="_blank" rel="noopener noreferrer"
                        data-testid={`btn-download-${doc.id}`}
                        style={{ color: "var(--miami-blue)", fontSize: 12 }}
                        className="hover:opacity-70 transition-opacity">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                      </a>
                      <button onClick={() => deleteMutation.mutate(doc.id)} data-testid={`btn-delete-${doc.id}`}
                        style={{ color: "rgba(255,255,255,0.25)", fontSize: 16 }}
                        className="hover:text-red-400 transition-colors">×</button>
                    </div>
                  </div>
                ))
              )}
              <button onClick={() => navigate(`/intake/${id}/upload`)} data-testid="btn-add-docs"
                className="flex items-center gap-2 mt-1 text-sm transition-all hover:opacity-70"
                style={{ color: "var(--miami-blue)", fontFamily: "Industry, sans-serif", fontSize: 12 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add documents
              </button>
            </Section>

            {/* Notes */}
            <Section title="Advisor Notes" icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            }>
              {editingNotes ? (
                <>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={4}
                    className="intake-input"
                    style={{ resize: "vertical" }}
                    placeholder="Add advisor notes, vehicle shortlist, next steps..."
                    data-testid="textarea-notes"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => notesMutation.mutate()} disabled={notesMutation.isPending}
                      data-testid="btn-save-notes"
                      className="px-4 py-2 rounded-lg text-xs font-bold transition-all hover:opacity-90"
                      style={{ background: "var(--miami-blue)", color: "var(--shelby-blue)", fontFamily: "Industry, sans-serif" }}>
                      {notesMutation.isPending ? "Saving..." : "Save Notes"}
                    </button>
                    <button onClick={() => setEditingNotes(false)}
                      className="px-4 py-2 rounded-lg text-xs font-bold transition-all hover:opacity-70"
                      style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)", fontFamily: "Industry, sans-serif" }}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <div className="cursor-pointer" onClick={() => setEditingNotes(true)} data-testid="div-notes">
                  {notes ? (
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{notes}</p>
                  ) : (
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
                      Click to add advisor notes...
                    </p>
                  )}
                </div>
              )}
            </Section>
          </div>
        </div>
      </main>
    </div>
  );
}
