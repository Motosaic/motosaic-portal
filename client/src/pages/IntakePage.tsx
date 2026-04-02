import { useState } from "react";
import { MotoLogoFull } from "@/components/MotoLogo";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Client } from "@shared/schema";

const STEPS = [
  { label: "Personal", icon: "👤" },
  { label: "Budget", icon: "💰" },
  { label: "Vehicle", icon: "🚗" },
  { label: "Trade-In", icon: "🔄" },
];

type HouseholdVehicle = { year: string; make: string };

type FormData = {
  // Step 1
  firstName: string; lastName: string; address: string; city: string; state: string; zip: string;
  // Step 2
  purchaseType: string; budget: string; downPayment: string;
  monthlyPayment: string; annualMileage: string; creditScore: string; timeframe: string;
  costcoMembership: string;  // "executive" | "standard" | "none"
  isVeteran: string;         // "yes" | "no"
  householdVehicles: HouseholdVehicle[];
  // Step 3
  passengerCount: string;    // "1-2" | "3" | "4+"
  bodyStyles: string[]; preferredMakes: string[];
  preferredModels: string; mustHaveFeatures: string; niceToHaveFeatures: string;
  exteriorColors: string[]; interiorColors: string[];
  suvSeatConfig: string;     // "captains" | "bench" | "no_preference"
  suvNumChildren: string;
  suvChildAges: string;
  suvHasPets: string;        // "yes" | "no"
  // Step 4
  hasTradeIn: boolean; tradeYear: string; tradeMake: string; tradeModel: string;
  tradeTrim: string; tradeMileage: string; tradeCondition: string; tradeOwed: string;
};

const initial: FormData = {
  firstName: "", lastName: "", address: "", city: "", state: "", zip: "",
  purchaseType: "finance", budget: "", downPayment: "",
  monthlyPayment: "", annualMileage: "", creditScore: "", timeframe: "",
  costcoMembership: "", isVeteran: "",
  householdVehicles: [],
  passengerCount: "",
  bodyStyles: [], preferredMakes: [],
  preferredModels: "", mustHaveFeatures: "", niceToHaveFeatures: "",
  exteriorColors: [], interiorColors: [],
  suvSeatConfig: "", suvNumChildren: "", suvChildAges: "", suvHasPets: "",
  hasTradeIn: false, tradeYear: "", tradeMake: "", tradeModel: "", tradeTrim: "",
  tradeMileage: "", tradeCondition: "", tradeOwed: "",
};

const BODY_STYLES = ["Sedan", "SUV", "Truck", "Crossover", "Coupe", "Van/Minivan", "Convertible", "Wagon"];

const MAKES = [
  "Acura", "Audi", "Bentley", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler", "Dodge",
  "Ford", "GMC", "Honda", "Hyundai", "Infiniti", "Jeep", "Kia", "Land Rover", "Lexus",
  "Lincoln", "Lucid", "Mazda", "Mercedes-Benz", "Nissan", "Porsche", "RAM", "Rivian",
  "Subaru", "Tesla", "Toyota", "Volkswagen", "Volvo",
];

const EXTERIOR_COLORS = [
  "White", "Black", "Silver", "Grey", "Blue", "Red", "Green", "Brown / Tan", "Orange", "Yellow", "Gold",
];

const INTERIOR_COLORS = ["Black", "Tan / Beige", "Brown", "Grey / White"];

const CREDIT_RANGES = [
  "Excellent (750+)", "Good (700–749)", "Fair (650–699)",
  "Below Average (600–649)", "Poor (<600)", "Not sure",
];

const TIMEFRAMES = [
  "ASAP — need within two weeks",
  "1–3 months",
  "3+ months",
];

const ANNUAL_MILEAGE = [
  "Less than 10,000 miles/year",
  "10,000–12,000 miles/year",
  "12,000–15,000 miles/year",
  "More than 15,000 miles/year",
];

const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const MUST_HAVE_CHIPS = [
  "Sunroof / Moonroof", "AWD / 4WD", "Heated Seats", "Third Row",
  "Apple CarPlay / Android Auto", "Backup Camera", "Blind Spot Monitoring",
  "Tow Package", "Cooled Seats", "Ventilated Seats", "Leather Interior",
  "HUD", "Parking Sensors", "Remote Start", "Premium Audio",
];

const NICE_TO_HAVE_CHIPS = [
  "Sunroof / Moonroof", "AWD / 4WD", "Heated Seats", "Third Row",
  "Apple CarPlay / Android Auto", "Backup Camera", "Blind Spot Monitoring",
  "Tow Package", "Cooled Seats", "Ventilated Seats", "Leather Interior",
  "HUD", "Parking Sensors", "Remote Start", "Premium Audio",
  "Wireless Charging", "360° Camera", "Lane Keep Assist", "Adaptive Cruise Control",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="step-indicator mb-6 md:mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <>
          <div key={i} className={`step ${i < current ? "done" : i === current ? "active" : ""}`}>
            {i < current ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : i + 1}
          </div>
          {i < total - 1 && <div key={`line-${i}`} className={`step-line ${i < current ? "done" : ""}`} />}
        </>
      ))}
    </div>
  );
}

// Mobile-responsive FieldRow: single column on mobile, configurable on md+
function FieldRow({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  const gridClass =
    cols === 2 ? "grid-cols-1 sm:grid-cols-2" :
    cols === 3 ? "grid-cols-1 sm:grid-cols-3" :
    "grid-cols-1";
  return <div className={`grid gap-3 md:gap-4 ${gridClass}`}>{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="intake-label">
        {label}
        {hint && <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.6)", fontSize: 11, marginLeft: 6 }}>({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function MultiSelect({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o]);
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {options.map(o => (
        <button key={o} type="button" onClick={() => toggle(o)}
          className="px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150"
          style={{
            background: value.includes(o) ? "var(--miami-blue)" : "rgba(255,255,255,0.07)",
            color: value.includes(o) ? "var(--shelby-blue)" : "rgba(255,255,255,0.75)",
            border: `1px solid ${value.includes(o) ? "var(--miami-blue)" : "rgba(255,255,255,0.1)"}`,
            fontFamily: "Industry, sans-serif",
            minHeight: 40,
          }}>
          {o}
        </button>
      ))}
    </div>
  );
}

// Chip selector for must-have / nice-to-have features
function FeatureChips({
  chips, selected, onChange, otherValue, onOtherChange, testPrefix,
}: {
  chips: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  otherValue: string;
  onOtherChange: (v: string) => void;
  testPrefix: string;
}) {
  const toggle = (chip: string) =>
    onChange(selected.includes(chip) ? selected.filter(x => x !== chip) : [...selected, chip]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mt-1">
        {chips.map(chip => (
          <button
            key={chip}
            type="button"
            onClick={() => toggle(chip)}
            className="px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150"
            style={{
              background: selected.includes(chip) ? "var(--miami-blue)" : "rgba(255,255,255,0.07)",
              color: selected.includes(chip) ? "var(--shelby-blue)" : "rgba(255,255,255,0.75)",
              border: `1px solid ${selected.includes(chip) ? "var(--miami-blue)" : "rgba(255,255,255,0.12)"}`,
              fontFamily: "Industry, sans-serif",
              minHeight: 40,
            }}
            data-testid={`chip-${testPrefix}-${chip.replace(/\W+/g, "_")}`}
          >
            {selected.includes(chip) ? "✓ " : ""}{chip}
          </button>
        ))}
      </div>
      <div className="mt-2">
        <input
          className="intake-input"
          placeholder="Other (type anything else...)"
          value={otherValue}
          onChange={e => onOtherChange(e.target.value)}
          data-testid={`input-${testPrefix}-other`}
        />
      </div>
    </div>
  );
}

// Tri-state makes picker: 0=neutral, 1=preferred (green), -1=not interested (red)
type MakeState = Record<string, 1 | -1 | 0>;

function TriStateMakes({ makes, state, onChange }: {
  makes: string[];
  state: MakeState;
  onChange: (s: MakeState) => void;
}) {
  const cycle = (make: string) => {
    const cur = state[make] ?? 0;
    const next: 1 | -1 | 0 = cur === 0 ? 1 : cur === 1 ? -1 : 0;
    onChange({ ...state, [make]: next });
  };
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {makes.map(make => {
        const s = state[make] ?? 0;
        const isPreferred = s === 1;
        const isNo = s === -1;
        return (
          <button
            key={make}
            type="button"
            onClick={() => cycle(make)}
            className="px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150"
            style={{
              background: isPreferred
                ? "rgba(20,200,80,0.18)"
                : isNo
                ? "rgba(220,60,60,0.18)"
                : "rgba(255,255,255,0.07)",
              color: isPreferred
                ? "#4ade80"
                : isNo
                ? "#f87171"
                : "rgba(255,255,255,0.75)",
              border: `1px solid ${
                isPreferred
                  ? "rgba(20,200,80,0.45)"
                  : isNo
                  ? "rgba(220,60,60,0.45)"
                  : "rgba(255,255,255,0.1)"
              }`,
              fontFamily: "Industry, sans-serif",
              minHeight: 40,
            }}
          >
            {isPreferred ? "✓ " : isNo ? "✕ " : ""}{make}
          </button>
        );
      })}
    </div>
  );
}

function formatCurrency(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";
  return "$" + Number(digits).toLocaleString("en-US");
}

function ToggleGroup({ options, value, onChange, testPrefix }: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
  testPrefix: string;
}) {
  return (
    <div className="flex gap-2 mt-1">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className="flex-1 rounded-xl font-bold transition-all"
          style={{
            background: value === v ? "var(--miami-blue)" : "rgba(255,255,255,0.07)",
            color: value === v ? "var(--shelby-blue)" : "rgba(255,255,255,0.75)",
            border: `1px solid ${value === v ? "var(--miami-blue)" : "rgba(255,255,255,0.1)"}`,
            fontFamily: "Industry, sans-serif",
            fontSize: 13,
            minHeight: 48,
            padding: "10px 8px",
          }}
          data-testid={`${testPrefix}-${v}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

// Section divider with label
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-1">
      <div className="flex-1 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }} />
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>{label}</span>
      <div className="flex-1 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IntakePage() {
  const { id: clientId } = useParams<{ id: string }>();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(initial);
  const [makesState, setMakesState] = useState<MakeState>({});

  // Chip selections for must-have and nice-to-have (separate from free-text "other")
  const [mustHaveChips, setMustHaveChips] = useState<string[]>([]);
  const [mustHaveOther, setMustHaveOther] = useState("");
  const [niceToHaveChips, setNiceToHaveChips] = useState<string[]>([]);
  const [niceToHaveOther, setNiceToHaveOther] = useState("");

  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Load existing client data to pre-fill
  const { data: existingClient } = useQuery<Client>({
    queryKey: ["/api/clients", clientId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/clients/${clientId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!clientId,
    staleTime: 30000,
  });

  // Pre-populate firstName/lastName from existing client record when first loaded
  const [namePrefilled, setNamePrefilled] = useState(false);
  if (existingClient && !namePrefilled) {
    if (existingClient.firstName || existingClient.lastName) {
      setForm(prev => ({
        ...prev,
        firstName: prev.firstName || existingClient.firstName || "",
        lastName: prev.lastName || existingClient.lastName || "",
      }));
    }
    setNamePrefilled(true);
  }

  const set = (field: keyof FormData, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value }));

  // Derive preferred/not-interested from tri-state
  const preferredMakes = Object.entries(makesState).filter(([,v]) => v === 1).map(([k]) => k);
  const notInterestedMakes = Object.entries(makesState).filter(([,v]) => v === -1).map(([k]) => k);

  // Build comma-separated feature strings from chips + other text
  const buildFeatureString = (chips: string[], other: string): string => {
    const parts = [...chips];
    const otherTrimmed = other.trim();
    if (otherTrimmed) parts.push(otherTrimmed);
    return parts.join(", ");
  };

  // Save questionnaire and mark complete
  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        ...data,
        bodyStyles: JSON.stringify(data.bodyStyles),
        preferredMakes: JSON.stringify(preferredMakes),
        notInterestedMakes: JSON.stringify(notInterestedMakes),
        exteriorColors: JSON.stringify(data.exteriorColors),
        interiorColors: JSON.stringify(data.interiorColors),
        householdVehicles: JSON.stringify(data.householdVehicles),
        mustHaveFeatures: buildFeatureString(mustHaveChips, mustHaveOther),
        niceToHaveFeatures: buildFeatureString(niceToHaveChips, niceToHaveOther),
      };
      await apiRequest("PATCH", `/api/clients/${clientId}/questionnaire`, payload);
      const res = await apiRequest("POST", `/api/clients/${clientId}/questionnaire-complete`);
      return res.json();
    },
    onSuccess: () => {
      navigate(`/documents/${clientId}`);
    },
    onError: () => {
      toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
    },
  });

  // Auto-save on step change
  const saveProgress = async (data: FormData) => {
    const payload = {
      ...data,
      bodyStyles: JSON.stringify(data.bodyStyles),
      preferredMakes: JSON.stringify(preferredMakes),
      notInterestedMakes: JSON.stringify(notInterestedMakes),
      exteriorColors: JSON.stringify(data.exteriorColors),
      interiorColors: JSON.stringify(data.interiorColors),
      householdVehicles: JSON.stringify(data.householdVehicles),
      mustHaveFeatures: buildFeatureString(mustHaveChips, mustHaveOther),
      niceToHaveFeatures: buildFeatureString(niceToHaveChips, niceToHaveOther),
    };
    apiRequest("PATCH", `/api/clients/${clientId}/questionnaire`, payload).catch(() => {});
  };

  const validateStep = () => {
    if (step === 0) return true;
    if (step === 1) {
      if (!form.purchaseType) return false;
      if (form.purchaseType === "cash") return !!form.timeframe;
      return !!(form.creditScore && form.timeframe);
    }
    return true;
  };

  const next = () => {
    if (!validateStep()) {
      toast({ title: "Please fill required fields", description: "Complete the highlighted fields before continuing.", variant: "destructive" });
      return;
    }
    if (step < STEPS.length - 1) {
      saveProgress(form);
      setStep(s => s + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      mutation.mutate(form);
    }
  };

  const back = () => {
    setStep(s => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isCash = form.purchaseType === "cash";
  const isLease = form.purchaseType === "lease";
  const isFinance = form.purchaseType === "finance";
  const hasSUV = form.bodyStyles.includes("SUV");

  const clientName = existingClient
    ? `${existingClient.firstName} ${existingClient.lastName}`
    : "";

  // ── Household vehicles helpers ──
  const addHouseholdVehicle = () =>
    set("householdVehicles", [...form.householdVehicles, { year: "", make: "" }]);
  const removeHouseholdVehicle = (i: number) =>
    set("householdVehicles", form.householdVehicles.filter((_, idx) => idx !== i));
  const updateHouseholdVehicle = (i: number, field: "year" | "make", value: string) => {
    const updated = form.householdVehicles.map((v, idx) => idx === i ? { ...v, [field]: value } : v);
    set("householdVehicles", updated);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(160deg, #002639 0%, #004363 60%, #003552 100%)" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5 border-b flex-shrink-0" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <MotoLogoFull height={30} />
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
          {clientName && <span className="hidden sm:inline" style={{ color: "rgba(255,255,255,0.4)", marginRight: 8 }}>{clientName} ·</span>}
          Step {step + 1}/{STEPS.length} — {STEPS[step].label}
        </div>
      </header>

      {/* Scrollable content — leaves room for sticky bottom nav */}
      <main className="flex-1 flex items-start justify-center px-4 py-6 md:py-10 pb-28 md:pb-10">
        <div className="w-full animate-in" style={{ maxWidth: 640 }}>
          {/* Step header */}
          <div className="mb-5 md:mb-6">
            <StepDots current={step} total={STEPS.length} />
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "white", marginBottom: 4 }} className="md:text-2xl">
              {STEPS[step].label} Information
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
              {step === 0 && "Your contact and registration details."}
              {step === 1 && "Help us understand your budget and financing goals."}
              {step === 2 && "What kind of vehicle are you looking for?"}
              {step === 3 && "Do you have a vehicle to trade in?"}
            </p>
          </div>

          {/* Card */}
          <div className="rounded-2xl p-5 md:p-8" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>

            {/* ── Step 1: Contact & Registration Address ── */}
            {step === 0 && (
              <div className="flex flex-col gap-4 md:gap-5">
                <FieldRow>
                  <Field label="First Name">
                    <input className="intake-input" placeholder="Mike" value={form.firstName}
                      onChange={e => set("firstName", e.target.value)} data-testid="input-first-name" />
                  </Field>
                  <Field label="Last Name">
                    <input className="intake-input" placeholder="Calcara" value={form.lastName}
                      onChange={e => set("lastName", e.target.value)} data-testid="input-last-name" />
                  </Field>
                </FieldRow>
                {existingClient && (
                  <FieldRow>
                    <Field label="Email Address">
                      <div className="intake-input flex items-center" style={{ opacity: 0.65, cursor: "default", background: "rgba(255,255,255,0.04)" }}>
                        {existingClient.email}
                      </div>
                    </Field>
                    <Field label="Phone Number">
                      <div className="intake-input flex items-center" style={{ opacity: 0.65, cursor: "default", background: "rgba(255,255,255,0.04)" }}>
                        {existingClient.phone}
                      </div>
                    </Field>
                  </FieldRow>
                )}
                <Field label="Registration Address" hint="where the vehicle will be registered">
                  <input className="intake-input" placeholder="123 Main St" value={form.address}
                    onChange={e => set("address", e.target.value)} data-testid="input-address" />
                </Field>
                {/* City / State / ZIP — stacks to 1-col on mobile */}
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                  <Field label="City">
                    <input className="intake-input" placeholder="Charlotte" value={form.city}
                      onChange={e => set("city", e.target.value)} data-testid="input-city" />
                  </Field>
                  <Field label="State">
                    <select className="intake-input" value={form.state} onChange={e => set("state", e.target.value)} data-testid="select-state">
                      <option value="">Select</option>
                      {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="ZIP Code">
                    <input className="intake-input" placeholder="28202" value={form.zip}
                      onChange={e => set("zip", e.target.value)} data-testid="input-zip" />
                  </Field>
                </div>
              </div>
            )}

            {/* ── Step 2: Budget (Dynamic) ── */}
            {step === 1 && (
              <div className="flex flex-col gap-5 md:gap-6">
                <Field label="How will you purchase? *">
                  <ToggleGroup
                    options={[["cash","Cash"],["finance","Finance / Loan"],["lease","Lease"]]}
                    value={form.purchaseType}
                    onChange={v => set("purchaseType", v)}
                    testPrefix="btn-purchase"
                  />
                </Field>

                <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }} />

                {/* ── Cash ── */}
                {isCash && (
                  <div className="flex flex-col gap-4 md:gap-5 animate-in">
                    <FieldRow>
                      <Field label="Total Budget">
                        <input className="intake-input" placeholder="$35,000" value={form.budget}
                          onChange={e => set("budget", e.target.value)}
                          onBlur={e => set("budget", formatCurrency(e.target.value))}
                          data-testid="input-budget" />
                      </Field>
                      <Field label="Down Payment">
                        <input className="intake-input" placeholder="$5,000" value={form.downPayment}
                          onChange={e => set("downPayment", e.target.value)}
                          onBlur={e => set("downPayment", formatCurrency(e.target.value))}
                          data-testid="input-down-payment" />
                      </Field>
                    </FieldRow>
                    <Field label="Purchase Timeframe *">
                      <select className="intake-input" value={form.timeframe} onChange={e => set("timeframe", e.target.value)} data-testid="select-timeframe">
                        <option value="">Select timeframe</option>
                        {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </Field>
                  </div>
                )}

                {/* ── Finance ── */}
                {isFinance && (
                  <div className="flex flex-col gap-4 md:gap-5 animate-in">
                    <FieldRow>
                      <Field label="Total Budget">
                        <input className="intake-input" placeholder="$35,000" value={form.budget}
                          onChange={e => set("budget", e.target.value)}
                          onBlur={e => set("budget", formatCurrency(e.target.value))}
                          data-testid="input-budget" />
                      </Field>
                      <Field label="Down Payment">
                        <input className="intake-input" placeholder="$5,000" value={form.downPayment}
                          onChange={e => set("downPayment", e.target.value)}
                          onBlur={e => set("downPayment", formatCurrency(e.target.value))}
                          data-testid="input-down-payment" />
                      </Field>
                    </FieldRow>
                    <FieldRow>
                      <Field label="Credit Score Range *">
                        <select className="intake-input" value={form.creditScore} onChange={e => set("creditScore", e.target.value)} data-testid="select-credit">
                          <option value="">Select range</option>
                          {CREDIT_RANGES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </Field>
                      <Field label="Purchase Timeframe *">
                        <select className="intake-input" value={form.timeframe} onChange={e => set("timeframe", e.target.value)} data-testid="select-timeframe">
                          <option value="">Select timeframe</option>
                          {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </Field>
                    </FieldRow>
                  </div>
                )}

                {/* ── Lease ── */}
                {isLease && (
                  <div className="flex flex-col gap-4 md:gap-5 animate-in">
                    <FieldRow>
                      <Field label="Target Monthly Payment">
                        <input className="intake-input" placeholder="$499/mo" value={form.monthlyPayment}
                          onChange={e => set("monthlyPayment", e.target.value)}
                          onBlur={e => set("monthlyPayment", formatCurrency(e.target.value))}
                          data-testid="input-monthly" />
                      </Field>
                      <Field label="Down Payment">
                        <input className="intake-input" placeholder="$2,000" value={form.downPayment}
                          onChange={e => set("downPayment", e.target.value)}
                          onBlur={e => set("downPayment", formatCurrency(e.target.value))}
                          data-testid="input-down-payment" />
                      </Field>
                    </FieldRow>
                    <Field label="How many miles do you drive per year?">
                      <select className="intake-input" value={form.annualMileage} onChange={e => set("annualMileage", e.target.value)} data-testid="select-mileage">
                        <option value="">Select mileage</option>
                        {ANNUAL_MILEAGE.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </Field>
                    <FieldRow>
                      <Field label="Credit Score Range *">
                        <select className="intake-input" value={form.creditScore} onChange={e => set("creditScore", e.target.value)} data-testid="select-credit">
                          <option value="">Select range</option>
                          {CREDIT_RANGES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </Field>
                      <Field label="Purchase Timeframe *">
                        <select className="intake-input" value={form.timeframe} onChange={e => set("timeframe", e.target.value)} data-testid="select-timeframe">
                          <option value="">Select timeframe</option>
                          {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </Field>
                    </FieldRow>
                  </div>
                )}

                <SectionDivider label="Savings & Incentives" />

                {/* Costco membership */}
                <Field label="Do you have a Costco membership?">
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 4, marginBottom: 8, lineHeight: 1.5 }}>
                    Costco members regularly receive exclusive discounts — worth checking before we begin.
                  </p>
                  <ToggleGroup
                    options={[["executive","Yes, Executive"],["standard","Yes, Standard"],["none","No"]]}
                    value={form.costcoMembership}
                    onChange={v => set("costcoMembership", v)}
                    testPrefix="btn-costco"
                  />
                </Field>

                {/* Veteran / First Responder */}
                <Field label="Are you a veteran or first responder?">
                  <ToggleGroup
                    options={[["yes","Yes"],["no","No"]]}
                    value={form.isVeteran}
                    onChange={v => set("isVeteran", v)}
                    testPrefix="btn-veteran"
                  />
                </Field>

                <SectionDivider label="Loyalty Incentives" />

                {/* Household vehicles */}
                <div>
                  <label className="intake-label">
                    What vehicles are currently in your household?
                    <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.6)", fontSize: 11, marginLeft: 6 }}>(year and make)</span>
                  </label>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 4, marginBottom: 8, lineHeight: 1.5 }}>
                    Existing brand ownership can unlock loyalty pricing.
                  </p>
                  {form.householdVehicles.length > 0 && (
                    <div className="flex flex-col gap-2 mb-3">
                      {form.householdVehicles.map((v, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input
                            className="intake-input flex-1"
                            placeholder="Year (e.g. 2019)"
                            value={v.year}
                            onChange={e => updateHouseholdVehicle(i, "year", e.target.value)}
                            data-testid={`input-hv-year-${i}`}
                          />
                          <input
                            className="intake-input flex-1"
                            placeholder="Make (e.g. Toyota)"
                            value={v.make}
                            onChange={e => updateHouseholdVehicle(i, "make", e.target.value)}
                            data-testid={`input-hv-make-${i}`}
                          />
                          <button
                            type="button"
                            onClick={() => removeHouseholdVehicle(i)}
                            style={{ color: "rgba(255,255,255,0.35)", fontSize: 20, minWidth: 36, minHeight: 36, flexShrink: 0 }}
                            className="flex items-center justify-center hover:text-red-400 transition-colors"
                            data-testid={`btn-remove-hv-${i}`}
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={addHouseholdVehicle}
                    data-testid="btn-add-hv"
                    className="rounded-xl font-bold transition-all active:scale-95"
                    style={{
                      background: "rgba(31,195,239,0.08)",
                      color: "var(--miami-blue)",
                      border: "1px solid rgba(31,195,239,0.2)",
                      fontFamily: "Industry, sans-serif",
                      fontSize: 13,
                      minHeight: 44,
                      padding: "0 20px",
                    }}
                  >
                    + Add Vehicle
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Vehicle Preferences ── */}
            {step === 2 && (
              <div className="flex flex-col gap-5">

                {/* Passengers FIRST */}
                <Field label="How many people will regularly be riding in it?">
                  <ToggleGroup
                    options={[["1-2","1–2 people"],["3","Up to 3"],["4+","4 or more"]]}
                    value={form.passengerCount}
                    onChange={v => set("passengerCount", v)}
                    testPrefix="btn-passengers"
                  />
                </Field>

                <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }} />

                {/* Body styles */}
                <Field label="Body Style (select all that apply)">
                  <MultiSelect options={BODY_STYLES} value={form.bodyStyles} onChange={v => set("bodyStyles", v)} />
                </Field>

                {/* Dynamic SUV follow-up */}
                {hasSUV && (
                  <div className="rounded-xl p-4 flex flex-col gap-4 animate-in"
                    style={{ background: "rgba(31,195,239,0.05)", border: "1px solid rgba(31,195,239,0.12)" }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "var(--miami-blue)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      SUV Details
                    </p>

                    <Field label="Seating configuration preference">
                      <ToggleGroup
                        options={[["captains","Captain's Chairs"],["bench","Bench Seat"],["no_preference","No Preference"]]}
                        value={form.suvSeatConfig}
                        onChange={v => set("suvSeatConfig", v)}
                        testPrefix="btn-suv-seats"
                      />
                    </Field>

                    <Field label="Number of children riding regularly">
                      <ToggleGroup
                        options={[["0","0"],["1","1"],["2","2"],["3","3"],["4+","4+"]]}
                        value={form.suvNumChildren}
                        onChange={v => set("suvNumChildren", v)}
                        testPrefix="btn-suv-children"
                      />
                    </Field>

                    {form.suvNumChildren && form.suvNumChildren !== "0" && (
                      <Field label="Ages of children" hint="approximate is fine">
                        <input
                          className="intake-input"
                          placeholder="e.g. 4, 7, 12"
                          value={form.suvChildAges}
                          onChange={e => set("suvChildAges", e.target.value)}
                          data-testid="input-suv-child-ages"
                        />
                      </Field>
                    )}

                    <Field label="Do you have dogs or regularly haul large cargo?">
                      <ToggleGroup
                        options={[["yes","Yes"],["no","No"]]}
                        value={form.suvHasPets}
                        onChange={v => set("suvHasPets", v)}
                        testPrefix="btn-suv-pets"
                      />
                    </Field>
                  </div>
                )}

                {/* Brands section — renamed */}
                <div>
                  <label className="intake-label">Love It or Leave It — Your Best &amp; Worst Brands</label>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 4, marginBottom: 6, lineHeight: 1.5 }}>
                    Tap once for ✓ preferred (green) · tap again for ✕ not interested (red) · tap again to clear.
                    You don't have to weigh in on every brand — just the ones that matter to you.
                  </p>
                  <TriStateMakes makes={MAKES} state={makesState} onChange={setMakesState} />
                </div>

                <Field label="Specific Models in Mind">
                  <input className="intake-input" placeholder="e.g. RAV4, F-150, 3 Series..." value={form.preferredModels}
                    onChange={e => set("preferredModels", e.target.value)} data-testid="input-models" />
                </Field>

                {/* Must-have features chips */}
                <div>
                  <label className="intake-label">Must-Have Features</label>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 4, marginBottom: 2, lineHeight: 1.5 }}>
                    Tap to select — these are deal-breakers we'll prioritize.
                  </p>
                  <FeatureChips
                    chips={MUST_HAVE_CHIPS}
                    selected={mustHaveChips}
                    onChange={setMustHaveChips}
                    otherValue={mustHaveOther}
                    onOtherChange={setMustHaveOther}
                    testPrefix="must-have"
                  />
                </div>

                {/* Nice-to-have features chips */}
                <div>
                  <label className="intake-label">Nice-to-Have Features</label>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 4, marginBottom: 2, lineHeight: 1.5 }}>
                    Would love these but won't walk away without them.
                  </p>
                  <FeatureChips
                    chips={NICE_TO_HAVE_CHIPS}
                    selected={niceToHaveChips}
                    onChange={setNiceToHaveChips}
                    otherValue={niceToHaveOther}
                    onOtherChange={setNiceToHaveOther}
                    testPrefix="nice-to-have"
                  />
                </div>

                <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }} />

                <Field label="Exterior Color Preference (select all that apply)">
                  <MultiSelect options={EXTERIOR_COLORS} value={form.exteriorColors} onChange={v => set("exteriorColors", v)} />
                </Field>
                <Field label="Interior Color Preference (select all that apply)">
                  <MultiSelect options={INTERIOR_COLORS} value={form.interiorColors} onChange={v => set("interiorColors", v)} />
                </Field>
              </div>
            )}

            {/* ── Step 4: Trade-In ── */}
            {step === 3 && (
              <div className="flex flex-col gap-5">
                <Field label="Do you have a vehicle to trade in?">
                  <div className="flex gap-2 mt-1">
                    {([[true,"Yes, I have a trade-in"],[false,"No trade-in"]] as [boolean, string][]).map(([v,l]) => (
                      <button key={String(v)} type="button" onClick={() => set("hasTradeIn", v)}
                        className="flex-1 rounded-xl font-bold transition-all"
                        style={{
                          background: form.hasTradeIn === v ? "var(--miami-blue)" : "rgba(255,255,255,0.07)",
                          color: form.hasTradeIn === v ? "var(--shelby-blue)" : "rgba(255,255,255,0.75)",
                          border: `1px solid ${form.hasTradeIn === v ? "var(--miami-blue)" : "rgba(255,255,255,0.1)"}`,
                          fontFamily: "Industry, sans-serif",
                          fontSize: 13,
                          minHeight: 52,
                          padding: "12px 8px",
                        }}
                        data-testid={`btn-trade-${String(v)}`}>
                        {String(l)}
                      </button>
                    ))}
                  </div>
                </Field>

                {form.hasTradeIn && (
                  <div className="flex flex-col gap-4 animate-in">
                    <FieldRow>
                      <Field label="Year">
                        <input className="intake-input" placeholder="2020" value={form.tradeYear}
                          onChange={e => set("tradeYear", e.target.value)} data-testid="input-trade-year" />
                      </Field>
                      <Field label="Make">
                        <input className="intake-input" placeholder="Toyota" value={form.tradeMake}
                          onChange={e => set("tradeMake", e.target.value)} data-testid="input-trade-make" />
                      </Field>
                    </FieldRow>
                    <FieldRow>
                      <Field label="Model">
                        <input className="intake-input" placeholder="Camry" value={form.tradeModel}
                          onChange={e => set("tradeModel", e.target.value)} data-testid="input-trade-model" />
                      </Field>
                      <Field label="Trim">
                        <input className="intake-input" placeholder="SE" value={form.tradeTrim}
                          onChange={e => set("tradeTrim", e.target.value)} data-testid="input-trade-trim" />
                      </Field>
                    </FieldRow>
                    <FieldRow>
                      <Field label="Mileage">
                        <input className="intake-input" placeholder="48,000" value={form.tradeMileage}
                          onChange={e => set("tradeMileage", e.target.value)} data-testid="input-trade-mileage" />
                      </Field>
                      <Field label="Condition">
                        <select className="intake-input" value={form.tradeCondition}
                          onChange={e => set("tradeCondition", e.target.value)} data-testid="select-trade-condition">
                          <option value="">Select</option>
                          <option>Excellent</option>
                          <option>Good</option>
                          <option>Fair</option>
                          <option>Poor</option>
                        </select>
                      </Field>
                    </FieldRow>
                    <Field label="Amount Owed on Vehicle">
                      <input className="intake-input" placeholder="$0 (paid off)" value={form.tradeOwed}
                        onChange={e => set("tradeOwed", e.target.value)} data-testid="input-trade-owed" />
                    </Field>
                  </div>
                )}

                {!form.hasTradeIn && (
                  <div className="rounded-xl p-5 text-center" style={{ background: "rgba(31,195,239,0.06)", border: "1px solid rgba(31,195,239,0.15)" }}>
                    <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 14 }}>
                      No trade-in — got it. After submitting, you'll be prompted to upload your key documents.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Desktop navigation (hidden on mobile — mobile uses sticky bottom bar) */}
          <div className="hidden md:flex gap-3 mt-6">
            {step > 0 && (
              <button onClick={back} data-testid="btn-back"
                className="flex-1 py-3 rounded-xl font-bold transition-all"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.7)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  fontSize: 14,
                  fontFamily: "Industry, sans-serif",
                }}>
                ← Back
              </button>
            )}
            <button onClick={next} disabled={mutation.isPending} data-testid="btn-next"
              className="flex-1 py-3 rounded-xl font-bold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
              style={{
                background: step === STEPS.length - 1 ? "var(--sao-paulo)" : "var(--miami-blue)",
                color: "var(--shelby-blue)",
                fontSize: 14,
                fontFamily: "Industry, sans-serif",
              }}>
              {mutation.isPending ? "Saving..." : step === STEPS.length - 1 ? "Save & Continue to Documents →" : "Continue →"}
            </button>
          </div>

          <p className="hidden md:block text-center mt-4" style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            Your progress is saved automatically. You can return at any time.
          </p>
        </div>
      </main>

      {/* ── Mobile sticky bottom navigation bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 py-3"
        style={{ background: "rgba(0,38,57,0.97)", borderTop: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(12px)" }}>
        <div className="flex gap-3 max-w-lg mx-auto">
          {step > 0 ? (
            <button onClick={back} data-testid="btn-back-mobile"
              className="rounded-xl font-bold transition-all active:scale-95"
              style={{
                background: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(255,255,255,0.12)",
                fontSize: 15,
                fontFamily: "Industry, sans-serif",
                minHeight: 52,
                minWidth: 64,
                padding: "0 16px",
              }}>
              ←
            </button>
          ) : (
            // Placeholder to keep Next button full-width when no back button
            <div style={{ minWidth: 0 }} />
          )}
          <button onClick={next} disabled={mutation.isPending} data-testid="btn-next-mobile"
            className="flex-1 rounded-xl font-bold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
            style={{
              background: step === STEPS.length - 1 ? "var(--sao-paulo)" : "var(--miami-blue)",
              color: "var(--shelby-blue)",
              fontSize: 15,
              fontFamily: "Industry, sans-serif",
              minHeight: 52,
            }}>
            {mutation.isPending ? "Saving..." : step === STEPS.length - 1 ? "Save & Continue →" : `Continue to ${STEPS[Math.min(step + 1, STEPS.length - 1)].label} →`}
          </button>
        </div>
        <p className="text-center mt-2" style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
          Progress saved automatically
        </p>
      </div>
    </div>
  );
}
