import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { MotoLogoFull } from "@/components/MotoLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { DeckDraft, Client } from "@shared/schema";

// ─── Page shell ──────────────────────────────────────────────────────────────

export default function DecksListPage() {
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [searchText, setSearchText] = useState("");

  // Auth gate
  const { data: authStatus, isLoading: authLoading } = useQuery<{
    authenticated: boolean;
  }>({ queryKey: ["/api/auth/admin/status"] });

  useEffect(() => {
    if (!authLoading && authStatus && !authStatus.authenticated) {
      setLocation("/admin");
    }
  }, [authStatus, authLoading, setLocation]);

  // Drafts list — status filter via URL param, client filter done client-side
  // so the search is instant.
  const draftsKey = statusFilter === "all"
    ? ["/api/decks"]
    : [`/api/decks?status=${statusFilter}`];
  const { data: drafts, isLoading: draftsLoading } = useQuery<DeckDraft[]>({
    queryKey: draftsKey,
    enabled: authStatus?.authenticated === true,
  });

  // Clients — for the "+ New draft" dialog and for joining names into the list
  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    enabled: authStatus?.authenticated === true,
  });

  const clientById = useMemo(() => {
    const map = new Map<number, Client>();
    (clients ?? []).forEach((c) => map.set(c.id, c));
    return map;
  }, [clients]);

  const filteredDrafts = useMemo(() => {
    const list = drafts ?? [];
    if (!searchText.trim()) return list;
    const q = searchText.trim().toLowerCase();
    return list.filter((d) => {
      const client = clientById.get(d.clientId);
      const name = client
        ? `${client.firstName ?? ""} ${client.lastName ?? ""}`.toLowerCase()
        : "";
      const title = (d.title ?? "").toLowerCase();
      return name.includes(q) || title.includes(q);
    });
  }, [drafts, searchText, clientById]);

  if (authLoading || !authStatus?.authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f8fafc" }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: "var(--shelby-blue)" }}>Checking auth…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#f8fafc" }}>
      <Header />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: "var(--shelby-blue)" }}>
              MotoMatch Decks
            </h1>
            <p style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>
              {(filteredDrafts ?? []).length} {statusFilter !== "all" && statusFilter} draft
              {(filteredDrafts ?? []).length === 1 ? "" : "s"}
            </p>
          </div>
          <NewDraftDialog clients={clients ?? []} />
        </div>

        <Card className="p-3 flex items-center gap-3 flex-wrap">
          <div className="flex gap-1">
            {(["active", "archived", "all"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                onClick={() => setStatusFilter(s)}
                style={
                  statusFilter === s
                    ? { background: "var(--shelby-blue)", color: "white" }
                    : {}
                }
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Input
              placeholder="Search by client name or draft title…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </Card>

        {draftsLoading ? (
          <p style={{ fontSize: 14, color: "#475569", padding: 24, textAlign: "center" }}>
            Loading drafts…
          </p>
        ) : filteredDrafts.length === 0 ? (
          <Card className="p-12 text-center">
            <p style={{ fontSize: 14, color: "#475569" }}>
              {drafts && drafts.length === 0
                ? "No drafts yet. Click +New draft to get started."
                : "No drafts match this filter."}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredDrafts.map((d) => (
              <DraftRow key={d.id} draft={d} client={clientById.get(d.clientId)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header() {
  const [, setLocation] = useLocation();
  return (
    <header
      style={{
        background: "linear-gradient(135deg, #002639 0%, #004363 100%)",
        padding: "16px 24px",
      }}
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <MotoLogoFull height={28} />
          <button
            onClick={() => setLocation("/admin")}
            style={{
              color: "var(--miami-blue)",
              fontSize: 13,
              fontWeight: 600,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            ← Admin
          </button>
        </div>
      </div>
    </header>
  );
}

// ─── One draft row ───────────────────────────────────────────────────────────

function DraftRow({ draft, client }: { draft: DeckDraft; client?: Client }) {
  const [, setLocation] = useLocation();

  // We don't have outputs in the list response — show a placeholder. The
  // workspace page shows full output history.
  const updatedAt = new Date(draft.updatedAt ?? draft.createdAt ?? "").toLocaleString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
  );

  return (
    <Card
      className="p-4 cursor-pointer transition hover:shadow-md"
      onClick={() => setLocation(`/decks/${draft.id}`)}
    >
      <div className="flex items-center justify-between gap-4">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2 mb-1">
            <h3
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--shelby-blue)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {draft.title ?? `Draft #${draft.id}`}
            </h3>
            {draft.status === "archived" && (
              <Badge variant="secondary" style={{ background: "#e2e8f0", color: "#475569" }}>
                archived
              </Badge>
            )}
          </div>
          <p style={{ fontSize: 13, color: "#475569" }}>
            for{" "}
            <strong>
              {client ? `${client.firstName} ${client.lastName}` : `client #${draft.clientId}`}
            </strong>{" "}
            · last activity {updatedAt}
            {draft.createdBy && draft.createdBy !== "mike" && (
              <> · by {draft.createdBy}</>
            )}
          </p>
        </div>
        <Button variant="ghost" size="sm">
          Open →
        </Button>
      </div>
    </Card>
  );
}

// ─── New draft dialog ────────────────────────────────────────────────────────

function NewDraftDialog({ clients }: { clients: Client[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (clientId: number) => {
      const res = await apiRequest("POST", "/api/decks", { clientId });
      return res.json() as Promise<DeckDraft>;
    },
    onSuccess: (draft) => {
      queryClient.invalidateQueries({ queryKey: ["/api/decks"] });
      setOpen(false);
      setLocation(`/decks/${draft.id}`);
    },
  });

  const filtered = useMemo(() => {
    const list = clients ?? [];
    if (!search.trim()) return list.slice(0, 30);
    const q = search.trim().toLowerCase();
    return list.filter((c) =>
      `${c.firstName ?? ""} ${c.lastName ?? ""} ${c.email ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [clients, search]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          style={{
            background: "var(--miami-blue)",
            color: "var(--shelby-blue)",
            fontWeight: 700,
          }}
        >
          + New draft
        </Button>
      </DialogTrigger>
      <DialogContent style={{ maxWidth: 520 }}>
        <DialogHeader>
          <DialogTitle>Pick a client</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div
          style={{
            maxHeight: 360,
            overflowY: "auto",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            marginTop: 8,
          }}
        >
          {filtered.length === 0 ? (
            <p style={{ padding: 16, color: "#475569", fontSize: 13 }}>No matches.</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => createMutation.mutate(c.id)}
                disabled={createMutation.isPending}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  background: "white",
                  border: "none",
                  borderBottom: "1px solid #f1f5f9",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--shelby-blue)" }}>
                  {c.firstName} {c.lastName}
                </div>
                <div style={{ fontSize: 12, color: "#475569" }}>
                  {c.email ?? "no email"} · {c.city || ""}
                  {c.state ? `, ${c.state}` : ""}
                </div>
              </button>
            ))
          )}
        </div>
        {createMutation.isError && (
          <p style={{ color: "#dc2626", fontSize: 13 }}>
            {(createMutation.error as Error)?.message || "Failed to create draft"}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
