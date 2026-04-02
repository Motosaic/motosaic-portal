import { useState, useRef, useCallback } from "react";
import { MotoLogoFull } from "@/components/MotoLogo";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Document, Client } from "@shared/schema";

// ─── Document type definitions ───────────────────────────────────────────────

const DOC_SECTIONS = [
  {
    title: "Identity Documents",
    description: "Required to verify your identity before we begin.",
    docs: [
      { key: "drivers_license_front", label: "Driver's License — Front", icon: "🪪", required: true, phase: "initial" },
      { key: "drivers_license_back",  label: "Driver's License — Back",  icon: "🪪", required: true, phase: "initial" },
    ],
  },
  {
    title: "Current Insurance",
    description: "Your existing insurance card on file.",
    docs: [
      { key: "insurance_current", label: "Current Proof of Insurance", icon: "📋", required: true, phase: "initial" },
    ],
  },
  {
    title: "Updated Insurance — New Vehicle",
    description: "Required once we secure your new vehicle. You can come back and upload these later.",
    badge: "After Vehicle Secured",
    docs: [
      {
        key: "insurance_new_id_card",
        label: "Updated Proof of Insurance — ID Card",
        sublabel: "Updated policy showing new VIN",
        icon: "🔄",
        required: true,
        phase: "post_purchase",
      },
      {
        key: "insurance_new_binder",
        label: "Updated Proof of Insurance — Policy Binder / Declaration Page",
        sublabel: "Full binder or dec page with new VIN",
        icon: "📑",
        required: true,
        phase: "post_purchase",
      },
    ],
  },
  {
    title: "Other Documents",
    description: "Optional but helpful — upload anything else that might be relevant. (Registration, Costco Membership Card, Proof of Income, etc.)",
    docs: [
      { key: "income",       label: "Proof of Income",       icon: "💵", required: false, phase: "initial" },
      { key: "registration", label: "Current Registration",  icon: "📄", required: false, phase: "initial" },
      { key: "other",        label: "Other Documents",        icon: "📎", required: false, phase: "initial" },
    ],
  },
];

const ALL_DOCS = DOC_SECTIONS.flatMap(s => s.docs);
const INITIAL_REQUIRED = ALL_DOCS.filter(d => d.required && d.phase === "initial");
const POST_REQUIRED    = ALL_DOCS.filter(d => d.required && d.phase === "post_purchase");

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Upload Zone (mobile-first: camera + file picker) ────────────────────────

function DropZone({ docType, clientId, onUploaded }: { docType: string; clientId: string; onUploaded: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("docType", docType);
    try {
      const res = await fetch(`https://portal.motosaic.com/api/clients/${clientId}/documents`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      onUploaded();
      toast({ title: "Uploaded successfully", description: file.name });
    } catch {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [docType, clientId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  };

  if (uploading) {
    return (
      <div className="drop-zone p-5 flex flex-col items-center justify-center gap-2">
        <div className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: "var(--miami-blue)", borderTopColor: "transparent" }} />
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Uploading...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Hidden inputs */}
      {/* Camera capture — mobile only */}
      <input
        ref={cameraInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        data-testid={`input-camera-${docType}`}
      />
      {/* File picker — camera + files */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf"
        onChange={handleChange}
        data-testid={`input-file-${docType}`}
      />

      {/* Mobile: two big tap buttons */}
      <div className="flex gap-2 md:hidden">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-xl transition-all active:scale-95"
          style={{
            background: "rgba(31,195,239,0.08)",
            border: "1px solid rgba(31,195,239,0.2)",
            minHeight: 72,
            padding: "12px 8px",
          }}
          data-testid={`btn-camera-${docType}`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--miami-blue)" strokeWidth="1.5">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--miami-blue)", fontFamily: "Industry, sans-serif", letterSpacing: "0.05em" }}>
            Take Photo
          </span>
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 flex flex-col items-center justify-center gap-1.5 rounded-xl transition-all active:scale-95"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            minHeight: 72,
            padding: "12px 8px",
          }}
          data-testid={`btn-browse-${docType}`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)", fontFamily: "Industry, sans-serif", letterSpacing: "0.05em" }}>
            Browse Files
          </span>
        </button>
      </div>

      {/* Desktop: classic drop zone */}
      <div
        className={`drop-zone hidden md:block p-5 text-center cursor-pointer transition-all ${isDragging ? "drag-over" : ""}`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        data-testid={`drop-zone-${docType}`}
      >
        <svg className="mx-auto mb-1.5" width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="var(--miami-blue)" strokeWidth="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
          Drop file or <span style={{ color: "var(--miami-blue)" }}>click to browse</span>
        </p>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>
          JPG, PNG, PDF — max 20MB
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: docs = [], refetch } = useQuery<Document[]>({
    queryKey: ["/api/clients", clientId, "documents"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/clients/${clientId}/documents`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: client } = useQuery<Client>({
    queryKey: ["/api/clients", clientId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/clients/${clientId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!clientId,
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: number) => apiRequest("DELETE", `/api/documents/${docId}`),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/clients", clientId, "documents"] });
    },
  });

  const uploadedByType = (key: string) => docs.filter(d => d.docType === key);
  const initialUploaded  = INITIAL_REQUIRED.filter(d => uploadedByType(d.key).length > 0).length;
  const postUploaded     = POST_REQUIRED.filter(d => uploadedByType(d.key).length > 0).length;
  const totalProgress    = initialUploaded + postUploaded;
  const totalRequired    = INITIAL_REQUIRED.length + POST_REQUIRED.length;

  const clientName = client ? `${client.firstName} ${client.lastName}` : "";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(160deg, #002639 0%, #004363 60%, #003552 100%)" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5 border-b flex-shrink-0" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <MotoLogoFull height={30} />
        {client && (
          <div className="text-right">
            <p style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{clientName}</p>
            <p className="hidden sm:block" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{client.email}</p>
          </div>
        )}
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-6 md:py-10 pb-28 md:pb-10">
        <div className="w-full animate-in" style={{ maxWidth: 700 }}>

          {/* Progress header */}
          <div className="mb-5 md:mb-7">
            <div className="flex items-start justify-between mb-2 gap-3">
              <div className="flex-1 min-w-0">
                <p style={{ color: "var(--miami-blue)", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 4 }}>
                  Document Center
                </p>
                <h1 style={{ fontSize: 20, fontWeight: 900, color: "white" }} className="md:text-2xl">Upload Your Documents</h1>
              </div>
              <span className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: "rgba(31,195,239,0.15)", color: "var(--miami-blue)", border: "1px solid rgba(31,195,239,0.3)" }}>
                {totalProgress}/{totalRequired} Required
              </span>
            </div>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 8 }}>
              Upload what you have now and come back any time to add more.
              Items marked ★ are required.
            </p>

            {/* Progress bar */}
            <div className="mt-4 rounded-full overflow-hidden" style={{ height: 5, background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(totalProgress / totalRequired) * 100}%`,
                  background: "linear-gradient(90deg, var(--miami-blue), var(--sao-paulo))",
                }} />
            </div>
          </div>

          {/* ── Expedite banner ── */}
          <div className="rounded-xl px-4 py-3 mb-6 flex gap-3 items-start"
            style={{
              background: "rgba(242,234,0,0.08)",
              border: "1px solid rgba(242,234,0,0.28)",
            }}>
            <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚡</span>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.55 }}>
              <span style={{ color: "var(--sao-paulo)", fontWeight: 700 }}>Upload your driver's license and current insurance card now</span>{" "}
              to keep things moving — when it's time to finalize your deal, having these on file means no last-minute scramble during business hours.
            </p>
          </div>

          {/* Document sections */}
          <div className="flex flex-col gap-6 md:gap-8">
            {DOC_SECTIONS.map((section, si) => {
              const isPostPurchase = section.docs.every(d => d.phase === "post_purchase");
              return (
                <div key={si}>
                  {/* Section heading */}
                  <div className="flex items-center gap-3 mb-3">
                    <h2 style={{ fontSize: 14, fontWeight: 700, color: "white" }}>{section.title}</h2>
                    {section.badge && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{ background: "rgba(242,234,0,0.12)", color: "var(--sao-paulo)", border: "1px solid rgba(242,234,0,0.25)" }}>
                        {section.badge}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>{section.description}</p>

                  {/* Doc slots */}
                  <div className="flex flex-col gap-3">
                    {section.docs.map(dt => {
                      const uploaded = uploadedByType(dt.key);
                      const isDone = uploaded.length > 0;
                      return (
                        <div key={dt.key} className="rounded-2xl overflow-hidden"
                          style={{
                            background: isDone ? "rgba(173,240,41,0.04)" : isPostPurchase ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.04)",
                            border: `1px solid ${isDone ? "rgba(173,240,41,0.2)" : isPostPurchase ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.09)"}`,
                          }}>
                          {/* Slot header */}
                          <div className="flex items-center justify-between px-4 md:px-5 py-3 md:py-4"
                            style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span style={{ fontSize: 18, flexShrink: 0 }}>{dt.icon}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span style={{ fontWeight: 700, fontSize: 13, color: "white" }}>{dt.label}</span>
                                  {dt.required && (
                                    <span style={{ color: "var(--sao-paulo)", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", flexShrink: 0 }}>★ REQUIRED</span>
                                  )}
                                </div>
                                {"sublabel" in dt && dt.sublabel && (
                                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{dt.sublabel}</p>
                                )}
                                {isDone && (
                                  <p style={{ fontSize: 12, color: "var(--gelbgrun)", marginTop: 2 }}>
                                    ✓ {uploaded.length} file{uploaded.length > 1 ? "s" : ""} uploaded
                                  </p>
                                )}
                              </div>
                            </div>
                            {isDone && (
                              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ml-2"
                                style={{ background: "rgba(173,240,41,0.15)" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gelbgrun)" strokeWidth="2.5">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                              </div>
                            )}
                          </div>

                          {/* Uploaded files */}
                          {uploaded.length > 0 && (
                            <div className="px-4 md:px-5 py-3 flex flex-col gap-2"
                              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                              {uploaded.map(doc => (
                                <div key={doc.id} className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                      style={{ background: "rgba(31,195,239,0.12)" }}>
                                      {doc.mimeType.includes("pdf") ? (
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--miami-blue)" strokeWidth="2">
                                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                          <polyline points="14 2 14 8 20 8"/>
                                        </svg>
                                      ) : (
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--miami-blue)" strokeWidth="2">
                                          <rect x="3" y="3" width="18" height="18" rx="2"/>
                                          <circle cx="8.5" cy="8.5" r="1.5"/>
                                          <polyline points="21 15 16 10 5 21"/>
                                        </svg>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.originalName}</p>
                                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{formatBytes(doc.fileSize)}</p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => deleteMutation.mutate(doc.id)}
                                    data-testid={`btn-delete-doc-${doc.id}`}
                                    style={{ color: "rgba(255,255,255,0.3)", fontSize: 20, lineHeight: 1, flexShrink: 0, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}
                                    className="hover:text-red-400 transition-colors">×</button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Drop zone / upload buttons */}
                          <div className="p-3 md:p-4">
                            <DropZone docType={dt.key} clientId={clientId} onUploaded={refetch} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop action button */}
          <div className="hidden md:flex flex-col gap-3 mt-10">
            <button
              onClick={() => navigate("/portal")}
              data-testid="btn-save-return"
              className="w-full py-4 rounded-xl font-bold transition-all hover:opacity-90 active:scale-95"
              style={{
                background: "var(--miami-blue)",
                color: "var(--shelby-blue)",
                fontSize: 15,
                fontFamily: "Industry, sans-serif",
              }}>
              Save &amp; Return to Dashboard
            </button>
            {initialUploaded >= INITIAL_REQUIRED.length && (
              <p className="text-center" style={{ fontSize: 12, color: "var(--gelbgrun)", fontWeight: 600 }}>
                ✓ Initial required documents complete. Updated insurance can be added once your new vehicle is secured.
              </p>
            )}
          </div>

          <p className="hidden md:block text-center mt-4" style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            Your uploads are saved automatically. Log back in any time to continue.
          </p>
        </div>
      </main>

      {/* ── Mobile sticky bottom bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 py-3"
        style={{ background: "rgba(0,38,57,0.97)", borderTop: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(12px)" }}>
        <button
          onClick={() => navigate("/portal")}
          data-testid="btn-save-return-mobile"
          className="w-full rounded-xl font-bold transition-all active:scale-95"
          style={{
            background: "var(--miami-blue)",
            color: "var(--shelby-blue)",
            fontSize: 15,
            fontFamily: "Industry, sans-serif",
            minHeight: 52,
          }}>
          Save &amp; Return to Dashboard
        </button>
        {initialUploaded >= INITIAL_REQUIRED.length && (
          <p className="text-center mt-2" style={{ fontSize: 11, color: "var(--gelbgrun)", fontWeight: 600 }}>
            ✓ Initial required docs complete
          </p>
        )}
      </div>
    </div>
  );
}
