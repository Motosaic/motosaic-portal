import { useState, useEffect } from "react";
import { MotoLogoFull } from "@/components/MotoLogo";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Document } from "@shared/schema";
import { isUATSession } from "@/lib/uat";
import { UATToolbar } from "@/components/UATToolbar";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientSession {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  questionnaireComplete: boolean;
  status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (session: ClientSession) => void }) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/client-login", { phone, email });
      return res.json();
    },
    onSuccess: (data: ClientSession) => {
      onLogin(data);
    },
    onError: () => {
      toast({ title: "Something went wrong", description: "Please check your info and try again.", variant: "destructive" });
    },
  });

  const canSubmit = phone.replace(/\D/g, "").length >= 10 && email.includes("@");

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "linear-gradient(160deg, #002639 0%, #004363 60%, #003552 100%)" }}
    >
      {/* Background decorative circles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: "var(--miami-blue)" }} />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full opacity-8"
          style={{ background: "var(--miami-blue)" }} />
      </div>

      <div className="relative z-10 w-full animate-in" style={{ maxWidth: 460 }}>
        <div className="flex justify-center mb-8 md:mb-10">
          <MotoLogoFull height={44} />
        </div>

        <p className="text-center mb-2" style={{ color: "var(--miami-blue)", fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" }}>
          Client Portal
        </p>
        <h1 className="text-center mb-3" style={{ fontSize: 26, fontWeight: 900, color: "white", lineHeight: 1.2 }}>
          Welcome
        </h1>
        <p className="text-center mb-6 md:mb-8" style={{ fontSize: 14, color: "rgba(255,255,255,0.92)", lineHeight: 1.65, padding: "0 8px" }}>
          Enter your email and phone number to access your onboarding progress or start a new application.
        </p>

        <div className="rounded-2xl p-5 md:p-8 flex flex-col gap-4 md:gap-5"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}>

          <div>
            <label className="intake-label">Email Address *</label>
            <input
              className="intake-input"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              data-testid="input-login-email"
            />
          </div>

          <div>
            <label className="intake-label">Phone Number *</label>
            <input
              className="intake-input"
              type="tel"
              inputMode="tel"
              placeholder="(704) 555-0100"
              value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              data-testid="input-login-phone"
            />
          </div>

          {/* Remember note */}
          <div className="rounded-xl px-4 py-3 flex gap-3 items-start"
            style={{ background: "rgba(31,195,239,0.08)", border: "1px solid rgba(31,195,239,0.2)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--miami-blue)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.92)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--miami-blue)" }}>Remember these details.</strong> Your email and phone number are your login going forward.
            </p>
          </div>

          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            data-testid="btn-login"
            className="w-full rounded-xl font-bold transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
            style={{
              background: "var(--miami-blue)",
              color: "var(--shelby-blue)",
              fontSize: 16,
              fontFamily: "Industry, sans-serif",
              marginTop: 4,
              minHeight: 52,
            }}
          >
            {mutation.isPending ? "Loading..." : "Access My Portal →"}
          </button>
        </div>

        <p className="text-center mt-5 md:mt-6" style={{ fontSize: 13, color: "rgba(255,255,255,0.68)", padding: "0 8px" }}>
          New client? Enter your details to get started.
          Returning? Use the same email &amp; phone to pick up where you left off.
        </p>
      </div>
    </div>
  );
}

// ─── Progress Hub ─────────────────────────────────────────────────────────────

function ProgressHub({ session, onReset, onSessionUpdate, isUAT }: { session: ClientSession; onReset: () => void; onSessionUpdate: (s: ClientSession) => void; isUAT: boolean }) {
  const [, navigate] = useLocation();

  // Refresh session on every mount so questionnaireComplete reflects DB truth
  useEffect(() => {
    apiRequest("GET", `/api/clients/${session.id}`)
      .then((r) => r.json())
      .then((client) => {
        if (client?.id) {
          onSessionUpdate({
            id: client.id,
            email: client.email,
            phone: client.phone,
            firstName: client.firstName,
            lastName: client.lastName,
            questionnaireComplete: client.questionnaireComplete ?? false,
            status: client.status ?? "",
          });
        }
      })
      .catch(() => { /* ignore — session will remain as-is */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  const { data: docs = [] } = useQuery<Document[]>({
    queryKey: ["/api/clients", session.id, "documents"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/clients/${session.id}/documents`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const initialRequiredTypes = ["drivers_license_front", "drivers_license_back", "insurance_current"];
  const postRequiredTypes    = ["insurance_new_id_card", "insurance_new_binder"];
  const allRequiredTypes     = [...initialRequiredTypes, ...postRequiredTypes];
  const uploadedRequired     = allRequiredTypes.filter(t => docs.some(d => d.docType === t)).length;
  const initialUploaded      = initialRequiredTypes.filter(t => docs.some(d => d.docType === t)).length;
  const docsComplete         = uploadedRequired >= allRequiredTypes.length;

  const qComplete = session.questionnaireComplete;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, #002639 0%, #004363 60%, #003552 100%)" }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5 border-b flex-shrink-0" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <MotoLogoFull height={30} />
        <div className="flex items-center gap-3 md:gap-5">
          <div className="text-right">
            <p style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{session.firstName} {session.lastName}</p>
            <p className="hidden sm:block" style={{ fontSize: 11, color: "rgba(255,255,255,0.85)" }}>{session.email}</p>
          </div>
          <button
            onClick={onReset}
            style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, fontFamily: "Industry, sans-serif" }}
            className="hover:text-white transition-colors"
            data-testid="btn-logout"
          >
            Log Out
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-8 md:py-12">
        <div className="w-full animate-in" style={{ maxWidth: 600 }}>

          {/* Greeting */}
          <div className="mb-6 md:mb-8">
            <p style={{ color: "var(--miami-blue)", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 6 }}>
              Your Progress
            </p>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: "white", marginBottom: 8 }}>
              Welcome back, {session.firstName}.
            </h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.92)" }}>
              {!qComplete
                ? "Complete your questionnaire to help us find your perfect vehicle."
                : !docsComplete
                ? "Questionnaire complete! Now let's get your documents uploaded."
                : "You're all set — the Motosaic team is reviewing your application."}
            </p>
          </div>

          {/* Overall progress bar */}
          <div className="mb-6 md:mb-8">
            <div className="flex justify-between mb-2">
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.82)" }}>Overall Progress</span>
              <span style={{ fontSize: 12, color: "var(--miami-blue)", fontWeight: 700 }}>
                {[qComplete, docsComplete].filter(Boolean).length} / 2 steps complete
              </span>
            </div>
            <div className="rounded-full overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,0.08)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${([qComplete, docsComplete].filter(Boolean).length / 2) * 100}%`,
                  background: "linear-gradient(90deg, var(--miami-blue), var(--sao-paulo))",
                }}
              />
            </div>
          </div>

          {/* Step cards */}
          <div className="flex flex-col gap-3 md:gap-4">
            {/* Card 1: Questionnaire */}
            <StepCard
              number={1}
              title="Vehicle Questionnaire"
              description="Tell us about your preferences, budget, and financing needs."
              complete={qComplete}
              locked={false}
              ctaLabel={qComplete ? "Review Answers" : "Start Questionnaire →"}
              onCta={() => navigate(`/intake/${session.id}`)}
              detail={qComplete ? "4 sections completed" : "4 sections · ~5 minutes"}
              testId="card-questionnaire"
            />

            {/* Card 2: Document Upload */}
            <StepCard
              number={2}
              title="Document Upload"
              description="Upload your driver's license, insurance, and key documents."
              complete={docsComplete}
              locked={false}
              ctaLabel={docsComplete ? "Manage Documents" : "Upload Documents →"}
              onCta={() => navigate(`/documents/${session.id}`)}
              detail={initialUploaded >= initialRequiredTypes.length
                ? `${docs.length} file${docs.length !== 1 ? "s" : ""} uploaded · awaiting post-vehicle docs`
                : `${uploadedRequired}/${allRequiredTypes.length} required documents uploaded`}
              testId="card-documents"
            />
          </div>

          {/* All done state */}
          {qComplete && docsComplete && (
            <div className="mt-5 md:mt-6 rounded-2xl p-5 md:p-6 text-center"
              style={{ background: "rgba(173,240,41,0.07)", border: "1px solid rgba(173,240,41,0.2)" }}>
              <p style={{ fontSize: 22, marginBottom: 8 }}>🎉</p>
              <p style={{ fontWeight: 700, color: "var(--gelbgrun)", fontSize: 15, marginBottom: 4 }}>
                Application Complete
              </p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.92)" }}>
                Your Motosaic advisor will reach out within one business day.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* UAT floating toolbar */}
      {isUAT && <UATToolbar clientId={session.id} current="portal" />}
    </div>
  );
}

function StepCard({
  number, title, description, complete, locked, ctaLabel, onCta, detail, testId
}: {
  number: number;
  title: string;
  description: string;
  complete: boolean;
  locked: boolean;
  ctaLabel: string;
  onCta: () => void;
  detail: string;
  testId: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 md:p-6 flex items-center gap-4 md:gap-5 transition-all"
      style={{
        background: locked ? "rgba(255,255,255,0.025)" : complete ? "rgba(173,240,41,0.05)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${locked ? "rgba(255,255,255,0.06)" : complete ? "rgba(173,240,41,0.2)" : "rgba(31,195,239,0.2)"}`,
        opacity: locked ? 0.72 : 1,
      }}
      data-testid={testId}
    >
      {/* Step number / check */}
      <div
        className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center"
        style={{
          background: complete ? "rgba(173,240,41,0.15)" : locked ? "rgba(255,255,255,0.05)" : "rgba(31,195,239,0.12)",
          border: `1.5px solid ${complete ? "var(--gelbgrun)" : locked ? "rgba(255,255,255,0.1)" : "var(--miami-blue)"}`,
        }}
      >
        {complete ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gelbgrun)" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : locked ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        ) : (
          <span style={{ fontWeight: 900, color: "var(--miami-blue)", fontSize: 15, fontFamily: "Industry, sans-serif" }}>{number}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span style={{ fontWeight: 700, fontSize: 14, color: locked ? "rgba(255,255,255,0.55)" : "white" }}>{title}</span>
          {complete && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold"
              style={{ background: "rgba(173,240,41,0.15)", color: "var(--gelbgrun)", border: "1px solid rgba(173,240,41,0.3)" }}>
              Complete
            </span>
          )}
          {locked && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold"
              style={{ background: "rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.68)", border: "1px solid rgba(255,255,255,0.15)" }}>
              Locked
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: locked ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.55)", marginBottom: 3 }}>{description}</p>
        <p style={{ fontSize: 11, color: complete ? "var(--gelbgrun)" : locked ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.45)", fontWeight: 600 }}>{detail}</p>
      </div>

      {/* CTA */}
      {!locked && (
        <button
          onClick={onCta}
          data-testid={`btn-${testId}`}
          className="flex-shrink-0 rounded-xl font-bold text-sm transition-all hover:opacity-85 active:scale-95"
          style={{
            background: complete ? "rgba(255,255,255,0.08)" : "var(--miami-blue)",
            color: complete ? "rgba(255,255,255,0.6)" : "var(--shelby-blue)",
            border: complete ? "1px solid rgba(255,255,255,0.1)" : "none",
            fontFamily: "Industry, sans-serif",
            fontSize: 12,
            whiteSpace: "nowrap",
            minHeight: 40,
            padding: "8px 14px",
          }}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}

// ─── Main export: routes based on session state ───────────────────────────────

// Module-level session cache — persists across back-button navigation within the same tab
let _cachedSession: ClientSession | null = null;

export default function ClientPortalPage() {
  const [session, setSession] = useState<ClientSession | null>(_cachedSession);
  const isUAT = session ? isUATSession(session.email, session.phone) : false;

  const handleLogin = (s: ClientSession) => {
    _cachedSession = s;
    setSession(s);
  };

  const handleLogout = () => {
    _cachedSession = null;
    setSession(null);
  };

  // Auto-restore session from ?id= in the hash (hash-router puts query params inside the hash)
  // e.g. /#/portal?id=9  →  window.location.hash = "#/portal?id=9"
  useEffect(() => {
    if (session) return; // already logged in

    // Parse query string from hash (after the "?")
    const hashParts = window.location.hash.split("?");
    const idParam = hashParts.length > 1
      ? new URLSearchParams(hashParts[1]).get("id")
      : new URLSearchParams(window.location.search).get("id"); // fallback for non-hash
    if (!idParam) return;

    // Fetch the client record and restore the session silently
    apiRequest("GET", `/api/clients/${idParam}`)
      .then((r) => r.json())
      .then((client) => {
        if (client?.id) {
          handleLogin({
            id: client.id,
            email: client.email,
            phone: client.phone,
            firstName: client.firstName,
            lastName: client.lastName,
            questionnaireComplete: client.questionnaireComplete ?? false,
            status: client.status ?? "",
          });
          // Strip ?id= from the hash without triggering a re-render
          window.history.replaceState(null, "", window.location.pathname + hashParts[0]);
        }
      })
      .catch(() => { /* silently fall through — login form will show */ });
  }, []);

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <ProgressHub
      session={session}
      onReset={handleLogout}
      onSessionUpdate={handleLogin}
      isUAT={isUAT}
    />
  );
}
