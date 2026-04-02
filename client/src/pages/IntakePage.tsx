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

type FormData = {
  // Step 1
  email: string; address: string; city: string; state: string; zip: string;
  // Step 2
  purchaseType: string; budget: string; downPayment: string;
  monthlyPayment: string; annualMileage: string; creditScore: string; timeframe: string;
  // Step 3
  bodyStyles: string[]; preferredMakes: string[];
  preferredModels: string; mustHaveFeatures: string; niceToHaveFeatures: string;
  exteriorColors: string[]; interiorColors: string[];
  // Step 4
  hasTradeIn: boolean; tradeYear: string; tradeMake: string; tradeModel: string;
  tradeTrim: string; tradeMileage: string; tradeCondition: string; tradeOwed: string;
};

const initial: FormData = {
  email: "", address: "", city: "", state: "", zip: "",
  purchaseType: "finance", budget: "", downPayment: "",
  monthlyPayment: "", annualMileage: "", creditScore: "", timeframe: "",
  bodyStyles: [], preferredMakes: [], preferredModels: "",
  mustHaveFeatures: "", niceToHaveFeatures: "",
  exteriorColors: [], interiorColors: [],
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="step-indicator mb-8">
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

function FieldRow({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  return <div className={`grid gap-4 ${cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-1"}`}>{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="intake-label">
        {label}
        {hint && <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.35)", fontSize: 11, marginLeft: 6 }}>({hint})</span>}
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
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
          style={{
            background: value.includes(o) ? "var(--miami-blue)" : "rgba(255,255,255,0.07)",
            color: value.includes(o) ? "var(--shelby-blue)" : "rgba(255,255,255,0.65)",
            border: `1px solid ${value.includes(o) ? "var(--miami-blue)" : "rgba(255,255,255,0.1)"}`,
            fontFamily: "Industry, sans-serif",
          }}>
          {o}
        </button>
      ))}
    </div>
  );
}

function ToggleGroup({ options, value, onChange, testPrefix }: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
  testPrefix: string;
}) {
  return (
    <div className="flex gap-3 mt-1">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className="flex-1 py-3 rounded-xl text-sm font-bold transition-all"
          style={{
            background: value === v ? "var(--miami-blue)" : "rgba(255,255,255,0.07)",
            color: value === v ? "var(--shelby-blue)" : "rgba(255,255,255,0.65)",
            border: `1px solid ${value === v ? "var(--miami-blue)" : "rgba(255,255,255,0.1)"}`,
            fontFamily: "Industry, sans-serif",
          }}
          data-testid={`${testPrefix}-${v}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IntakePage() {
  const { id: clientId } = useParams<{ id: string }>();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(initial);
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
  });

  const set = (field: keyof FormData, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value }));

  // Save questionnaire and mark complete
  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        ...data,
        bodyStyles: JSON.stringify(data.bodyStyles),
        preferredMakes: JSON.stringify(data.preferredMakes),
        exteriorColors: JSON.stringify(data.exteriorColors),
        interiorColors: JSON.stringify(data.interiorColors),
      };
      // Save all data
      await apiRequest("PATCH", `/api/clients/${clientId}/questionnaire`, payload);
      // Mark complete
      const res = await apiRequest("POST", `/api/clients/${clientId}/questionnaire-complete`);
      return res.json();
    },
    onSuccess: () => {
      // Navigate to documents page
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
      preferredMakes: JSON.stringify(data.preferredMakes),
      exteriorColors: JSON.stringify(data.exteriorColors),
      interiorColors: JSON.stringify(data.interiorColors),
    };
    apiRequest("PATCH", `/api/clients/${clientId}/questionnaire`, payload).catch(() => {});
  };

  const validateStep = () => {
    if (step === 0) return true; // email/address optional on step 1 now (name/phone captured at login)
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
    } else {
      mutation.mutate(form);
    }
  };

  const back = () => setStep(s => Math.max(0, s - 1));

  // Derived: which fields show on budget step
  const isCash = form.purchaseType === "cash";
  const isLease = form.purchaseType === "lease";
  const isFinance = form.purchaseType === "finance";

  const clientName = existingClient
    ? `${existingClient.firstName} ${existingClient.lastName}`
    : "";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(160deg, #002639 0%, #004363 60%, #003552 100%)" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <MotoLogoFull height={36} />
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>
          {clientName && <span style={{ color: "rgba(255,255,255,0.3)", marginRight: 8 }}>{clientName} ·</span>}
          Step {step + 1} of {STEPS.length} — {STEPS[step].label}
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full animate-in" style={{ maxWidth: 640 }}>
          {/* Step header */}
          <div className="mb-6">
            <StepDots current={step} total={STEPS.length} />
            <h1 style={{ fontSize: 22, fontWeight: 900, color: "white", marginBottom: 6 }}>
              {STEPS[step].label} Information
            </h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)" }}>
              {step === 0 && "Your contact and registration details."}
              {step === 1 && "Help us understand your budget and financing goals."}
              {step === 2 && "What kind of vehicle are you looking for?"}
              {step === 3 && "Do you have a vehicle to trade in?"}
            </p>
          </div>

          {/* Card */}
          <div className="rounded-2xl p-8" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>

            {/* ── Step 1: Contact & Registration Address ── */}
            {step === 0 && (
              <div className="flex flex-col gap-5">
                <Field label="Email Address">
                  <input className="intake-input" type="email" placeholder="you@example.com" value={form.email}
                    onChange={e => set("email", e.target.value)} data-testid="input-email" />
                </Field>
                <Field label="Registration Address" hint="where the vehicle will be registered">
                  <input className="intake-input" placeholder="123 Main St" value={form.address}
                    onChange={e => set("address", e.target.value)} data-testid="input-address" />
                </Field>
                <FieldRow cols={3}>
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
                </FieldRow>
              </div>
            )}

            {/* ── Step 2: Budget (Dynamic) ── */}
            {step === 1 && (
              <div className="flex flex-col gap-6">
                {/* Purchase type selector */}
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
                  <div className="flex flex-col gap-5 animate-in">
                    <FieldRow>
                      <Field label="Total Budget">
                        <input className="intake-input" placeholder="$35,000" value={form.budget}
                          onChange={e => set("budget", e.target.value)} data-testid="input-budget" />
                      </Field>
                      <Field label="Down Payment">
                        <input className="intake-input" placeholder="$5,000" value={form.downPayment}
                          onChange={e => set("downPayment", e.target.value)} data-testid="input-down-payment" />
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
                  <div className="flex flex-col gap-5 animate-in">
                    <FieldRow>
                      <Field label="Total Budget">
                        <input className="intake-input" placeholder="$35,000" value={form.budget}
                          onChange={e => set("budget", e.target.value)} data-testid="input-budget" />
                      </Field>
                      <Field label="Down Payment">
                        <input className="intake-input" placeholder="$5,000" value={form.downPayment}
                          onChange={e => set("downPayment", e.target.value)} data-testid="input-down-payment" />
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
                  <div className="flex flex-col gap-5 animate-in">
                    <FieldRow>
                      <Field label="Target Monthly Payment">
                        <input className="intake-input" placeholder="$499/mo" value={form.monthlyPayment}
                          onChange={e => set("monthlyPayment", e.target.value)} data-testid="input-monthly" />
                      </Field>
                      <Field label="Down Payment">
                        <input className="intake-input" placeholder="$2,000" value={form.downPayment}
                          onChange={e => set("downPayment", e.target.value)} data-testid="input-down-payment" />
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
              </div>
            )}

            {/* ── Step 3: Vehicle Preferences ── */}
            {step === 2 && (
              <div className="flex flex-col gap-5">
                <Field label="Body Style (select all that apply)">
                  <MultiSelect options={BODY_STYLES} value={form.bodyStyles} onChange={v => set("bodyStyles", v)} />
                </Field>
                <Field label="Preferred Makes (select all that apply)">
                  <MultiSelect options={MAKES} value={form.preferredMakes} onChange={v => set("preferredMakes", v)} />
                </Field>
                <Field label="Specific Models in Mind">
                  <input className="intake-input" placeholder="e.g. RAV4, F-150, 3 Series..." value={form.preferredModels}
                    onChange={e => set("preferredModels", e.target.value)} data-testid="input-models" />
                </Field>
                <Field label="Must-Have Features">
                  <textarea className="intake-input" rows={2} placeholder="e.g. Sunroof, AWD, heated seats, third row..."
                    value={form.mustHaveFeatures} onChange={e => set("mustHaveFeatures", e.target.value)}
                    data-testid="textarea-must-have" style={{ resize: "none" }} />
                </Field>
                <Field label="Nice-to-Have Features">
                  <textarea className="intake-input" rows={2} placeholder="e.g. Apple CarPlay, premium audio, cooled seats..."
                    value={form.niceToHaveFeatures} onChange={e => set("niceToHaveFeatures", e.target.value)}
                    data-testid="textarea-nice-to-have" style={{ resize: "none" }} />
                </Field>
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
                  <div className="flex gap-3 mt-1">
                    {[[true,"Yes, I have a trade-in"],[false,"No trade-in"]].map(([v,l]) => (
                      <button key={String(v)} type="button" onClick={() => set("hasTradeIn", v)}
                        className="flex-1 py-3 rounded-xl text-sm font-bold transition-all"
                        style={{
                          background: form.hasTradeIn === v ? "var(--miami-blue)" : "rgba(255,255,255,0.07)",
                          color: form.hasTradeIn === v ? "var(--shelby-blue)" : "rgba(255,255,255,0.65)",
                          border: `1px solid ${form.hasTradeIn === v ? "var(--miami-blue)" : "rgba(255,255,255,0.1)"}`,
                          fontFamily: "Industry, sans-serif",
                        }}
                        data-testid={`btn-trade-${String(v)}`}>
                        {String(l)}
                      </button>
                    ))}
                  </div>
                </Field>

                {form.hasTradeIn && (
                  <div className="flex flex-col gap-5 animate-in">
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
                  <div className="rounded-xl p-6 text-center" style={{ background: "rgba(31,195,239,0.06)", border: "1px solid rgba(31,195,239,0.15)" }}>
                    <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
                      No trade-in — got it. After submitting, you'll be prompted to upload your key documents.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex gap-3 mt-6">
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

          <p className="text-center mt-4" style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            Your progress is saved automatically. You can return at any time.
          </p>
        </div>
      </main>
    </div>
  );
}
