import { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { MotoLogoFull } from "@/components/MotoLogo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  DeckDraft,
  DeckMessage,
  DeckAttachment,
  DeckOutput,
  DeckVehicle,
  Client,
} from "@shared/schema";

const API = import.meta.env.VITE_API_BASE ?? "";

// Color tokens — bumped from the muted grays the first cut used.
// All meet WCAG AA on white.
const TEXT_PRIMARY = "#0f172a"; // slate-900
const TEXT_SECONDARY = "#334155"; // slate-700
const TEXT_MUTED = "#475569"; // slate-600 — for labels + secondary metadata
const TEXT_HINT = "#64748b"; // slate-500 — for placeholders
const BORDER = "#cbd5e1"; // slate-300
const BORDER_SOFT = "#e2e8f0"; // slate-200

type AttachmentRow = Pick<
  DeckAttachment,
  "id" | "draftId" | "filename" | "storedName" | "mimeType" | "fileSize" | "createdAt"
> & {
  hasContentText: boolean;
};

type DraftDetail = {
  draft: DeckDraft;
  client: Client;
  messages: DeckMessage[];
  attachments: AttachmentRow[];
  outputs: DeckOutput[];
  vehicles: DeckVehicle[];
};

// ─── Page shell ──────────────────────────────────────────────────────────────

export default function DeckWorkspacePage() {
  const [match, params] = useRoute<{ id: string }>("/decks/:id");
  const [, setLocation] = useLocation();
  const id = match && params ? parseInt(params.id, 10) : NaN;

  const { data: authStatus, isLoading: authLoading } = useQuery<{
    authenticated: boolean;
  }>({ queryKey: ["/api/auth/admin/status"] });

  useEffect(() => {
    if (!authLoading && authStatus && !authStatus.authenticated) {
      setLocation("/admin");
    }
  }, [authStatus, authLoading, setLocation]);

  const { data, isLoading, error } = useQuery<DraftDetail>({
    queryKey: [`/api/decks/${id}`],
    enabled: Number.isFinite(id) && authStatus?.authenticated === true,
  });

  if (!match || !Number.isFinite(id)) {
    return <ShellMessage title="Bad URL" body="The draft id in the URL isn't valid." />;
  }
  if (authLoading || !authStatus?.authenticated) {
    return <ShellMessage title="Checking auth…" />;
  }
  if (isLoading) {
    return <ShellMessage title="Loading draft…" />;
  }
  if (error || !data) {
    return (
      <ShellMessage
        title="Couldn't load this draft"
        body={error instanceof Error ? error.message : "Unknown error"}
      />
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#f1f5f9" }}>
      <Header draft={data.draft} client={data.client} />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6 pb-32">
        <ClientSummaryCard client={data.client} />
        <VehiclesCard draftId={id} vehicles={data.vehicles} />
        <AttachmentsCard draftId={id} attachments={data.attachments} />
        <OutputsCard draftId={id} outputs={data.outputs} />
        <ChatCard draftId={id} messages={data.messages} />
      </main>
      <GenerateBar draftId={id} latestVersion={data.outputs[0]?.version ?? null} />
    </div>
  );
}

function ShellMessage({ title, body }: { title: string; body?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#f1f5f9" }}>
      <div className="text-center">
        <p style={{ fontSize: 20, fontWeight: 700, color: "var(--shelby-blue)" }}>{title}</p>
        {body && <p style={{ fontSize: 14, color: TEXT_MUTED, marginTop: 8 }}>{body}</p>}
      </div>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header({ draft, client }: { draft: DeckDraft; client: Client }) {
  const [, setLocation] = useLocation();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(draft.title ?? "Untitled draft");
  const queryClient = useQueryClient();

  const renameMutation = useMutation({
    mutationFn: async (newTitle: string) => {
      const res = await apiRequest("PATCH", `/api/decks/${draft.id}`, { title: newTitle });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/decks/${draft.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/decks"] });
      setEditing(false);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const next = draft.status === "active" ? "archived" : "active";
      const res = await apiRequest("PATCH", `/api/decks/${draft.id}`, { status: next });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/decks/${draft.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/decks"] });
    },
  });

  return (
    <header
      style={{
        background: "linear-gradient(135deg, #002639 0%, #004363 100%)",
        padding: "16px 24px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
      }}
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <MotoLogoFull height={28} />
          <button
            onClick={() => setLocation("/decks")}
            style={{
              color: "#7dd3fc",
              fontSize: 14,
              fontWeight: 600,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            ← All decks
          </button>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            style={{
              background: draft.status === "archived" ? "#475569" : "#7dd3fc",
              color: draft.status === "archived" ? "white" : "#002639",
              fontWeight: 700,
            }}
          >
            {draft.status}
          </Badge>
          <Button
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
            variant="ghost"
            size="sm"
            style={{ color: "white" }}
          >
            {draft.status === "active" ? "Archive" : "Unarchive"}
          </Button>
        </div>
      </div>
      <div className="max-w-5xl mx-auto mt-4">
        {editing ? (
          <div className="flex gap-2 items-center">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              style={{ background: "white", maxWidth: 600, color: TEXT_PRIMARY }}
            />
            <Button onClick={() => renameMutation.mutate(title)} disabled={renameMutation.isPending} size="sm">
              Save
            </Button>
            <Button
              onClick={() => {
                setTitle(draft.title ?? "Untitled draft");
                setEditing(false);
              }}
              variant="ghost"
              size="sm"
              style={{ color: "white" }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            style={{
              fontSize: 24,
              fontWeight: 900,
              color: "white",
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {draft.title ?? "Untitled draft"}
            <span style={{ marginLeft: 10, fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 400 }}>
              (click to rename)
            </span>
          </button>
        )}
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 6 }}>
          for {client.firstName} {client.lastName}
        </p>
      </div>
    </header>
  );
}

// ─── Client summary card ─────────────────────────────────────────────────────

function ClientSummaryCard({ client }: { client: Client }) {
  const [, setLocation] = useLocation();
  const locationStr = [client.city, client.state, client.zip].filter(Boolean).join(", ");
  const priorities = (() => {
    try {
      const raw = client.priorityRankings ? JSON.parse(client.priorityRankings) : [];
      return Array.isArray(raw)
        ? raw.filter((p: any) => p?.rank && p.rank !== "na").length
        : 0;
    } catch {
      return 0;
    }
  })();

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "#0284c7" }}>
            CLIENT
          </p>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--shelby-blue)", marginTop: 4 }}>
            {client.firstName} {client.lastName}
          </h2>
          <p style={{ fontSize: 14, color: TEXT_SECONDARY, marginTop: 6 }}>
            {locationStr && <>{locationStr} · </>}
            {client.budget || "no budget set"} {client.purchaseType ? `· ${client.purchaseType}` : ""}
            {priorities > 0 && <> · {priorities} priorities ranked</>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocation(`/admin/clients/${client.id}`)}>
          Open client record →
        </Button>
      </div>
    </Card>
  );
}

// ─── Vehicles card (stateful working list) ───────────────────────────────────

type ParsedSuggestion = {
  year_make_model: string;
  msrp: string;
  key: string;
  note: string;
};

function VehiclesCard({
  draftId,
  vehicles,
}: {
  draftId: number;
  vehicles: DeckVehicle[];
}) {
  const queryClient = useQueryClient();
  const [addText, setAddText] = useState("");
  const [suggestion, setSuggestion] = useState<ParsedSuggestion | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [`/api/decks/${draftId}`] });

  const moveMutation = useMutation({
    mutationFn: async (args: { vehicleId: number; direction: "up" | "down" }) => {
      await apiRequest(
        "PATCH",
        `/api/decks/${draftId}/vehicles/${args.vehicleId}`,
        { direction: args.direction }
      );
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (vehicleId: number) => {
      await apiRequest("DELETE", `/api/decks/${draftId}/vehicles/${vehicleId}`);
    },
    onSuccess: invalidate,
  });

  const addMutation = useMutation({
    mutationFn: async (s: ParsedSuggestion) => {
      const res = await apiRequest("POST", `/api/decks/${draftId}/vehicles`, {
        year_make_model: s.year_make_model,
        msrp: s.msrp,
        key: s.key,
        source: "manual",
      });
      return res.json();
    },
    onSuccess: () => {
      setAddText("");
      setSuggestion(null);
      setSuggestionError(null);
      invalidate();
    },
  });

  async function handleSuggest() {
    const text = addText.trim();
    if (!text || parsing) return;
    setParsing(true);
    setSuggestion(null);
    setSuggestionError(null);
    try {
      const res = await apiRequest("POST", `/api/decks/${draftId}/vehicles/parse`, { text });
      const json = (await res.json()) as ParsedSuggestion;
      setSuggestion(json);
    } catch (err: any) {
      setSuggestionError(err?.message?.replace(/^\d+:\s*/, "") || "Couldn't interpret");
    } finally {
      setParsing(false);
    }
  }

  return (
    <Card className="p-5" style={{ borderLeft: "4px solid #0284c7" }}>
      <div className="flex items-baseline justify-between mb-3">
        <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--shelby-blue)", letterSpacing: "0.05em" }}>
          VEHICLES IN DECK ({vehicles.length})
        </h3>
        <p style={{ fontSize: 12, color: TEXT_MUTED }}>
          Edit freely — changes apply to the next Generate.
        </p>
      </div>

      {vehicles.length === 0 ? (
        <p style={{ fontSize: 14, color: TEXT_SECONDARY, padding: "12px 0" }}>
          No vehicles yet. Click <strong>Generate</strong> at the bottom to have the AI propose a starting list, or
          add one manually below.
        </p>
      ) : (
        <div className="space-y-2 mb-3">
          {vehicles.map((v, idx) => (
            <div
              key={v.id}
              className="flex items-center gap-3 px-3 py-2 rounded"
              style={{ background: "white", border: `1px solid ${BORDER_SOFT}` }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  background: "var(--shelby-blue)",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {idx + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY }}>
                  {v.yearMakeModel}
                </div>
                <div style={{ fontSize: 13, color: TEXT_MUTED }}>
                  {v.msrp || "no MSRP"}
                  <span style={{ marginLeft: 8, fontSize: 11, color: TEXT_HINT }}>
                    · {v.source === "manual" ? "added by you" : "from AI"}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={idx === 0 || moveMutation.isPending}
                  onClick={() => moveMutation.mutate({ vehicleId: v.id, direction: "up" })}
                  title="Move up"
                  style={{ padding: "0 8px", color: TEXT_SECONDARY }}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={idx === vehicles.length - 1 || moveMutation.isPending}
                  onClick={() => moveMutation.mutate({ vehicleId: v.id, direction: "down" })}
                  title="Move down"
                  style={{ padding: "0 8px", color: TEXT_SECONDARY }}
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Remove "${v.yearMakeModel}" from the deck?`)) {
                      deleteMutation.mutate(v.id);
                    }
                  }}
                  title="Remove"
                  style={{ padding: "0 8px", color: "#dc2626" }}
                >
                  ✕
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add vehicle inline form */}
      <div
        style={{
          paddingTop: 12,
          borderTop: vehicles.length > 0 ? `1px solid ${BORDER_SOFT}` : "none",
        }}
      >
        <div className="flex gap-2">
          <Input
            placeholder='Add a vehicle — type "Cadillac CT5" or "fast luxury SUV under 90k"'
            value={addText}
            onChange={(e) => {
              setAddText(e.target.value);
              setSuggestion(null);
              setSuggestionError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSuggest();
              }
            }}
            style={{ color: TEXT_PRIMARY }}
          />
          <Button onClick={handleSuggest} disabled={!addText.trim() || parsing}>
            {parsing ? "…" : "Suggest"}
          </Button>
        </div>

        {suggestionError && (
          <p style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{suggestionError}</p>
        )}

        {suggestion && (
          <div
            className="mt-3 p-3 rounded"
            style={{ background: "#f0f9ff", border: "1px solid #7dd3fc" }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY }}>
              {suggestion.year_make_model}
            </div>
            <div style={{ fontSize: 13, color: TEXT_SECONDARY }}>
              {suggestion.msrp}{" "}
              <span style={{ color: TEXT_HINT }}>· key: {suggestion.key}</span>
            </div>
            {suggestion.note && (
              <p style={{ fontSize: 13, color: TEXT_SECONDARY, marginTop: 6, fontStyle: "italic" }}>
                {suggestion.note}
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={() => addMutation.mutate(suggestion)}
                disabled={addMutation.isPending}
                style={{ background: "var(--shelby-blue)", color: "white" }}
              >
                Add to deck
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSuggestion(null);
                  setSuggestionError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Attachments ─────────────────────────────────────────────────────────────

function AttachmentsCard({
  draftId,
  attachments,
}: {
  draftId: number;
  attachments: AttachmentRow[];
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: number) => {
      await apiRequest("DELETE", `/api/decks/${draftId}/attachments/${attachmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/decks/${draftId}`] });
    },
  });

  async function handleUpload(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/api/decks/${draftId}/attachments`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { message?: string }));
        throw new Error(j.message || `Upload failed (${res.status})`);
      }
      queryClient.invalidateQueries({ queryKey: [`/api/decks/${draftId}`] });
    } catch (err: any) {
      setUploadError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--shelby-blue)", letterSpacing: "0.05em" }}>
          ATTACHMENTS
        </h3>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "+ Add file"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div
          className="flex items-center justify-between px-3 py-2 rounded"
          style={{ background: "#f1f5f9", border: `1px dashed ${BORDER}` }}
        >
          <span style={{ fontSize: 14, color: TEXT_PRIMARY }}>
            <strong>Questionnaire</strong>{" "}
            <span style={{ color: TEXT_MUTED }}>(live — read from client record at Generate time)</span>
          </span>
        </div>
        {attachments.length === 0 ? (
          <p style={{ fontSize: 14, color: TEXT_SECONDARY, padding: "8px 0" }}>
            No additional files yet. Drop in transcripts, notes, or anything else worth feeding to the generator.
          </p>
        ) : (
          attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between px-3 py-2 rounded border"
              style={{ borderColor: BORDER_SOFT }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>{a.filename}</span>
                <span style={{ fontSize: 13, color: TEXT_MUTED, marginLeft: 8 }}>
                  {formatBytes(a.fileSize)}
                  {!a.hasContentText && (
                    <span style={{ color: "#b45309", marginLeft: 8 }}>· no text extracted</span>
                  )}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm(`Delete "${a.filename}"?`)) deleteMutation.mutate(a.id);
                }}
                style={{ color: "#dc2626" }}
              >
                ✕
              </Button>
            </div>
          ))
        )}
      </div>
      {uploadError && (
        <p style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{uploadError}</p>
      )}
    </Card>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Past outputs ────────────────────────────────────────────────────────────

function OutputsCard({ draftId, outputs }: { draftId: number; outputs: DeckOutput[] }) {
  if (outputs.length === 0) {
    return (
      <Card className="p-5">
        <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--shelby-blue)", letterSpacing: "0.05em" }}>
          PAST OUTPUTS
        </h3>
        <p style={{ fontSize: 14, color: TEXT_SECONDARY, marginTop: 8 }}>
          No decks generated yet. Click Generate at the bottom when ready.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--shelby-blue)", letterSpacing: "0.05em", marginBottom: 10 }}>
        PAST OUTPUTS ({outputs.length})
      </h3>
      <div className="space-y-2">
        {outputs.map((o) => {
          const compiled = (() => {
            try {
              return JSON.parse(o.compiledJson);
            } catch {
              return null;
            }
          })();
          const vehicleCount = compiled?.vehicles?.length ?? "?";
          const when = new Date(o.generatedAt ?? "").toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });
          return (
            <div
              key={o.id}
              className="flex items-center justify-between px-3 py-2 rounded border"
              style={{ borderColor: BORDER_SOFT }}
            >
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--shelby-blue)" }}>
                  v{o.version}
                </span>
                <span style={{ fontSize: 14, color: TEXT_SECONDARY, marginLeft: 8 }}>
                  {when} · {vehicleCount} vehicles · {o.tokensInput}→{o.tokensOutput} tok
                </span>
              </div>
              <a
                href={`${API}/api/decks/${draftId}/outputs/${o.id}/file`}
                download
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0369a1",
                  textDecoration: "none",
                }}
              >
                Download .pptx ↓
              </a>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Chat ────────────────────────────────────────────────────────────────────

function ChatCard({ draftId, messages }: { draftId: number; messages: DeckMessage[] }) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/decks/${draftId}/messages`, {
        content,
        role: "user",
      });
      return res.json();
    },
    onSuccess: () => {
      setInput("");
      queryClient.invalidateQueries({ queryKey: [`/api/decks/${draftId}`] });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  }

  return (
    <Card className="p-5">
      <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--shelby-blue)", letterSpacing: "0.05em", marginBottom: 10 }}>
        CHAT
      </h3>
      <div
        ref={scrollRef}
        className="space-y-3"
        style={{
          maxHeight: 480,
          overflowY: "auto",
          padding: "10px 6px",
          background: "white",
          borderRadius: 6,
          border: `1px solid ${BORDER_SOFT}`,
        }}
      >
        {messages.length === 0 ? (
          <p style={{ fontSize: 14, color: TEXT_SECONDARY, padding: 12 }}>
            No messages yet. Type voice/copy notes for the next Generate below — for example:{" "}
            <em>"Trim the GX blurb, emphasize the Toyota service angle."</em>
          </p>
        ) : (
          messages.map((m) => <MessageRow key={m.id} message={m} />)
        )}
      </div>

      <div className="mt-3 flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type notes for the next Generate (voice tweaks, per-vehicle adjustments)…"
          rows={2}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
          }}
          style={{ resize: "vertical", color: TEXT_PRIMARY }}
        />
        <Button onClick={handleSend} disabled={!input.trim() || sendMutation.isPending}>
          Send
        </Button>
      </div>
      <p style={{ fontSize: 12, color: TEXT_HINT, marginTop: 6 }}>
        Cmd/Ctrl+Enter to send. Messages stack up here and feed into the next Generate.
      </p>
    </Card>
  );
}

function MessageRow({ message }: { message: DeckMessage }) {
  const isUser = message.role === "user";

  const rendered = (() => {
    const re = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts: Array<string | { text: string; href: string }> = [];
    let lastIdx = 0;
    let match;
    while ((match = re.exec(message.content)) !== null) {
      if (match.index > lastIdx) parts.push(message.content.slice(lastIdx, match.index));
      parts.push({ text: match[1], href: match[2] });
      lastIdx = re.lastIndex;
    }
    if (lastIdx < message.content.length) parts.push(message.content.slice(lastIdx));
    return parts;
  })();

  return (
    <div
      className="px-3 py-2 rounded"
      style={{
        background: isUser ? "#dbeafe" : "#f1f5f9",
        border: isUser ? "none" : `1px solid ${BORDER_SOFT}`,
        marginLeft: isUser ? 40 : 0,
        marginRight: isUser ? 0 : 40,
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.08em",
          color: isUser ? "#1e3a8a" : "var(--shelby-blue)",
          marginBottom: 4,
        }}
      >
        {isUser ? "YOU" : "DECK GENERATOR"}
      </p>
      <div style={{ fontSize: 14, color: TEXT_PRIMARY, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
        {rendered.map((p, i) =>
          typeof p === "string" ? (
            <span key={i}>{p}</span>
          ) : (
            <a
              key={i}
              href={`${API}${p.href}`}
              download
              style={{ color: "#0369a1", fontWeight: 700 }}
            >
              {p.text}
            </a>
          )
        )}
      </div>
    </div>
  );
}

// ─── Generate bar (sticky bottom) ────────────────────────────────────────────

function GenerateBar({
  draftId,
  latestVersion,
}: {
  draftId: number;
  latestVersion: number | null;
}) {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const res = await apiRequest("POST", `/api/decks/${draftId}/generate`, {});
      await res.json();
      queryClient.invalidateQueries({ queryKey: [`/api/decks/${draftId}`] });
    } catch (err: any) {
      setError(err?.message || "Generate failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "rgba(0, 38, 57, 0.97)",
        backdropFilter: "blur(8px)",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        padding: "14px 24px",
        zIndex: 50,
      }}
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
        <div style={{ color: "white" }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
            {latestVersion ? `Last generated: v${latestVersion}` : "No decks generated yet"}
          </p>
          {error && <p style={{ fontSize: 13, color: "#fca5a5", marginTop: 2 }}>{error}</p>}
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generating}
          size="lg"
          style={{
            background: generating ? "#64748b" : "#7dd3fc",
            color: "#002639",
            fontWeight: 800,
            minWidth: 220,
            fontSize: 15,
          }}
        >
          {generating ? "Generating… (30–60s)" : latestVersion ? `Generate v${latestVersion + 1}` : "Generate"}
        </Button>
      </div>
    </div>
  );
}
