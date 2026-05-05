import { useState } from "react";
import { MotoLogoFull } from "@/components/MotoLogo";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Client } from "@shared/schema";
import { isUATSession } from "@/lib/uat";
import { UATToolbar } from "@/components/UATToolbar";

const STEPS = [
  { label: "Personal", icon: "👤" },
  { label: "Budget", icon: "💰" },
  { label: "Vehicle", icon: "🚗" },
  { label: "Trade-In", icon: "🔄" },
  { label: "Priorities", icon: "⭐" },
];

// ─── Priority Ranking config ─────────────────────────────────────────────────────

export const PRIORITY_CATEGORIES = [
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
  "Third Row Space",             // N/A-eligible — kept last
];

// Ranks: 1 = lowest, 5 = highest importance. "na" = not applicable.
export type PriorityRank = 1 | 2 | 3 | 4 | 5 | "na";
export type PriorityRankings = Record<string, PriorityRank>;

const RANK_COLORS: Record<string | number, { bg: string; text: string; label: string }> = {
  1: { bg: "#374151",  text: "#9ca3af", label: "1" },  // grey — lowest
  2: { bg: "#1d4ed8",  text: "#bfdbfe", label: "2" },  // blue
  3: { bg: "#0369a1",  text: "#7dd3fc", label: "3" },  // sky blue (Miami Blue family)
  4: { bg: "#15803d",  text: "#bbf7d0", label: "4" },  // green
  5: { bg: "#ADF029",  text: "#001f30", label: "5" },  // Gelbgrün — highest
  na:{ bg: "#1e293b",  text: "rgba(255,255,255,0.35)", label: "N/A" },
};

function PriorityRankingStep({
  rankings,
  onChange,
}: {
  rankings: PriorityRankings;
  onChange: (r: PriorityRankings) => void;
}) {
  const setRank = (cat: string, rank: PriorityRank) => {
    onChange({ ...rankings, [cat]: rank });
  };

  // Live buckets: group categories by their selected rank
  const buckets: Record<string, string[]> = { "5": [], "4": [], "3": [], "2": [], "1": [], na: [] };
  for (const cat of PRIORITY_CATEGORIES) {
    const r = rankings[cat];
    if (r != null) buckets[String(r)].push(cat);
  }
  const ranked = PRIORITY_CATEGORIES.filter(c => rankings[c] != null);
  const total  = PRIORITY_CATEGORIES.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.92)", lineHeight: 1.5 }}>
          Tap a number to rate each factor 1–5 in importance to you.
          <span style={{ color: "rgba(255,255,255,0.52)" }}> 1 = least important · 5 = most important</span>
        </p>
      </div>

      {/* Main layout: table left, live summary right */}
      <div className="flex gap-4 items-start">

        {/* ── Left: category chip rows */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          {PRIORITY_CATEGORIES.map((cat) => {
            const selected = rankings[cat];
            const isThirdRow = cat === "Third Row Space";
            const ranks: PriorityRank[] = isThirdRow
              ? [1, 2, 3, 4, 5, "na"]
              : [1, 2, 3, 4, 5];

            return (
              <div key={cat} className="flex flex-col gap-1">
                {isThirdRow && (
                  <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0 6px" }} />
                )}
                <div className="flex items-center gap-2">
                  {/* Category label */}
                  <span
                    style={{
                      fontSize: 12,
                      color: selected != null ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)",
                      fontFamily: "Industry, sans-serif",
                      fontWeight: selected != null ? 600 : 400,
                      width: 180,
                      flexShrink: 0,
                      lineHeight: 1.3,
                    }}
                  >
                    {cat}
                  </span>

                  {/* Rank chips */}
                  <div className="flex gap-1 flex-wrap">
                    {ranks.map((rank) => {
                      const active = selected === rank;
                      const cfg = RANK_COLORS[rank];
                      return (
                        <button
                          key={rank}
                          type="button"
                          onClick={() => setRank(cat, rank)}
                          style={{
                            minWidth: rank === "na" ? 38 : 30,
                            height: 30,
                            borderRadius: 8,
                            border: active ? "none" : "1px solid rgba(255,255,255,0.12)",
                            background: active ? cfg.bg : "rgba(255,255,255,0.05)",
                            color: active ? cfg.text : "rgba(255,255,255,0.35)",
                            fontSize: 11,
                            fontWeight: 700,
                            fontFamily: "Industry, sans-serif",
                            cursor: "pointer",
                            transition: "all 0.12s",
                            letterSpacing: "0.03em",
                          }}
                        >
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Right: live bucket summary (desktop) */}
        <div
          className="hidden md:flex flex-col gap-2"
          style={{ width: 180, flexShrink: 0, position: "sticky", top: 100 }}
        >
          <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.78)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
            Live Summary &mdash; {ranked.length}/{total} rated
          </p>
          {(["5","4","3","2","1","na"] as const).map((r) => {
            const cfg = RANK_COLORS[r];
            const items = buckets[r];
            return (
              <div key={r}
                style={{
                  borderRadius: 10,
                  border: `1px solid ${items.length > 0 ? cfg.bg : "rgba(255,255,255,0.06)"}`,
                  background: items.length > 0 ? `${cfg.bg}22` : "rgba(255,255,255,0.03)",
                  padding: "8px 10px",
                  transition: "all 0.2s",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: items.length > 0 ? cfg.bg : "rgba(255,255,255,0.2)",
                    fontFamily: "Industry, sans-serif",
                    minWidth: 26,
                  }}>
                    {r === "na" ? "N/A" : `★ ${r}`}
                  </span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.52)" }}>
                    {items.length > 0 ? `(${items.length})` : ""}
                  </span>
                </div>
                {items.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {items.map(item => (
                      <span key={item} style={{ fontSize: 10, color: "rgba(255,255,255,0.85)", lineHeight: 1.4 }}>
                        {item}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.68)", fontStyle: "italic" }}>none yet</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: live summary as compact horizontal strip */}
      <div className="md:hidden flex flex-col gap-2 mt-2">
        <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.78)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Summary — {ranked.length}/{total} rated
        </p>
        <div className="flex gap-2 flex-wrap">
          {(["5","4","3","2","1","na"] as const).map((r) => {
            const cfg = RANK_COLORS[r];
            const items = buckets[r];
            if (!items.length) return null;
            return (
              <div key={r} style={{
                borderRadius: 8,
                background: `${cfg.bg}33`,
                border: `1px solid ${cfg.bg}`,
                padding: "4px 8px",
                fontSize: 10,
                color: cfg.text,
                fontWeight: 600,
                fontFamily: "Industry, sans-serif",
              }}>
                {r === "na" ? "N/A" : `★${r}`}: {items.length}
              </div>
            );
          })}
        </div>
        {/* Expanded on mobile */}
        {(["5","4","3","2","1","na"] as const).map((r) => {
          const cfg = RANK_COLORS[r];
          const items = buckets[r];
          if (!items.length) return null;
          return (
            <div key={r} style={{
              borderRadius: 8,
              background: `${cfg.bg}18`,
              border: `1px solid ${cfg.bg}55`,
              padding: "6px 10px",
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: cfg.bg === "#ADF029" ? "#ADF029" : cfg.text, fontFamily: "Industry, sans-serif" }}>
                {r === "na" ? "N/A" : `★ ${r} — `}
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.82)" }}>{items.join(" · ")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type HouseholdVehicle = { year: string; make: string; model?: string; trim?: string };
type ChildEntry = { age: string; seatType: "car_seat" | "booster" | "neither" | "" };

type FormData = {
  // Step 1
  firstName: string; lastName: string; address: string; city: string; state: string; zip: string;
  // Step 2
  purchaseType: string; budget: string; downPayment: string;
  monthlyPayment: string; annualMileage: string; creditScore: string; timeframe: string;
  budgetPriorityStance: string; // "perfect_car" | "balanced" | "budget_ceiling"
  costcoMembership: string;  // "executive" | "standard" | "none"
  isVeteran: string;         // "yes" | "no"
  householdVehicles: HouseholdVehicle[];
  // Step 3
  primaryUseCases: string[];
  specialUseCases: string;
  passengerRequirement: string; // "just_me" | "2_adults" | "2_adults_1_2" | "2_adults_3_plus"
  childrenRiding: string;       // "yes" | "no" (UI-only)
  childrenInVehicle: ChildEntry[];
  dogSpace: string;             // "yes" | "no"
  thirdRowUsage: string;        // "daily" | "occasional" | "rarely"
  secondRowPreference: string;  // see schema
  bodyStyles: string[]; preferredMakes: string[];
  preferredModels: string;
  exteriorColors: string[]; interiorColors: string[];
  // Legacy (kept for column reuse)
  passengerCount: string;
  suvSeatConfig: string;
  suvMaxSeating: string;
  suvNumChildren: string;
  suvChildAges: string;
  suvHasPets: string;
  // Powertrain
  powertrain: string;        // "gas" | "hybrid" | "phev" | "ev" | "indifferent"
  evLongRange: string;
  homeCharging: string;      // "level2" | "level1" | "no_charging" | "na"
  // Safety / Comfort chip lists
  safetyTechFeatures: string[];
  comfortFeatures: string[];
  // Catch-all
  additionalNotes: string;
  // Step 4
  hasTradeIn: boolean; tradeYear: string; tradeMake: string; tradeModel: string;
  tradeTrim: string; tradeMileage: string; tradeCondition: string; tradeOwed: string;
  // Step 5
  priorityRankings: PriorityRankings;
};

const initial: FormData = {
  firstName: "", lastName: "", address: "", city: "", state: "", zip: "",
  purchaseType: "finance", budget: "", downPayment: "",
  monthlyPayment: "", annualMileage: "", creditScore: "", timeframe: "",
  budgetPriorityStance: "",
  costcoMembership: "", isVeteran: "",
  householdVehicles: [],
  primaryUseCases: [], specialUseCases: "",
  passengerRequirement: "",
  childrenRiding: "",
  childrenInVehicle: [],
  dogSpace: "",
  thirdRowUsage: "",
  secondRowPreference: "",
  bodyStyles: [], preferredMakes: [],
  preferredModels: "",
  exteriorColors: [], interiorColors: [],
  passengerCount: "", suvSeatConfig: "", suvMaxSeating: "", suvNumChildren: "", suvChildAges: "", suvHasPets: "",
  powertrain: "", evLongRange: "",
  homeCharging: "",
  safetyTechFeatures: [],
  comfortFeatures: [],
  additionalNotes: "",
  hasTradeIn: false, tradeYear: "", tradeMake: "", tradeModel: "", tradeTrim: "",
  tradeMileage: "", tradeCondition: "", tradeOwed: "",
  priorityRankings: {},
};

const BODY_STYLES = [
  "Sedan", "Coupe", "SUV 2-row", "SUV 3-row", "Pickup Truck", "Minivan", "Wagon", "I'm flexible",
];

const PRIMARY_USE_CASES = [
  "Daily driving & life errands",
  "Long road trips",
  "Towing & hauling",
  "Off-road",
  "Client-facing & business image",
  "Weekend fun",
];

const SAFETY_TECH_CHIPS = [
  "Adaptive cruise control",
  "Full self-driving capability (Super Cruise, BlueCruise, Tesla FSD)",
  "Lane keep assist",
  "Lane centering",
  "Blind-spot monitoring",
  "360° surround-view camera",
  "Rear cross-traffic alert",
  "Automatic emergency braking",
  "Rear automatic braking",
  "Driver attention monitoring",
  "Traffic sign recognition",
  "Night vision",
  "Head-up display (HUD)",
  "Parking assist / self-parking",
  "Just the basics is fine",
];

const COMFORT_CHIPS = [
  "Ventilated / cooled front seats",
  "Heated front seats",
  "Heated rear seats",
  "Heated steering wheel",
  "Massaging seats",
  "Multi-zone climate control",
  "Rear-seat climate controls",
  "Premium / upgraded interior materials",
  "Panoramic or full-glass roof",
  "Power-adjustable / memory seats",
  "Easy-access second row (power sliding or folding)",
  "Ambient / mood lighting",
  "Premium audio system",
  "Rear window shade / privacy glass",
];

const MAKES = [
  "Acura", "Audi", "Bentley", "BMW", "Buick", "Cadillac", "Chevrolet", "Chrysler", "Dodge",
  "Ford", "GMC", "Honda", "Hyundai", "Infiniti", "Jeep", "Kia", "Land Rover", "Lexus",
  "Lincoln", "Lucid", "Mazda", "Mercedes-Benz", "Nissan", "Porsche", "RAM", "Rivian",
  "Subaru", "Tesla", "Toyota", "Volkswagen", "Volvo",
];

const EXTERIOR_COLORS = [
  "Black", "White", "Silver", "Grey", "Blue", "Red", "Green", "Other",
];

const INTERIOR_COLORS = ["Black", "Dark/Saddle Brown", "Tan", "Grey/White"];

const CREDIT_RANGES = [
  "650 or below",
  "650–700",
  "700+",
];

const TIMEFRAMES = [
  "ASAP",
  "0–3 months",
  "3–6 months",
  "6–12 months",
  "Just exploring",
];

const ANNUAL_MILEAGE = [
  "10k or less",
  "10–12k",
  "12–15k",
  "15k+",
];

const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const MUST_HAVE_CHIPS = [
  "Standard Sunroof", "Panoramic (XL) Sunroof", "AWD / 4WD", "Heated Seats",
  "Heated Steering Wheel", "Ventilated / Cooled Seats", "Third Row",
  "Apple CarPlay / Android Auto", "Backup Camera", "Blind Spot Monitoring",
  "Tow Package", "Leather Interior", "Heads Up Display (HUD)",
  "Parking Sensors", "Remote Start", "Premium Audio",
  "Power Liftgate", "Self-Driving / Driver Assist Suite",
  "Plug-In Hybrid (PHEV)", "Electric Vehicle (EV)",
];

const NICE_TO_HAVE_CHIPS = [
  "Standard Sunroof", "Panoramic (XL) Sunroof", "AWD / 4WD", "Heated Seats",
  "Heated Steering Wheel", "Ventilated / Cooled Seats", "Third Row",
  "Apple CarPlay / Android Auto", "Backup Camera", "Blind Spot Monitoring",
  "Tow Package", "Leather Interior", "Heads Up Display (HUD)",
  "Parking Sensors", "Remote Start", "Premium Audio",
  "Power Liftgate", "Self-Driving / Driver Assist Suite",
  "Plug-In Hybrid (PHEV)", "Electric Vehicle (EV)",
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
        {hint && <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.82)", fontSize: 11, marginLeft: 6 }}>({hint})</span>}
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

// Unified tri-state feature chip selector
// State: 0 = neutral, 1 = nice-to-have (blue), 2 = must-have (green)
type FeatureState = Record<string, 0 | 1 | 2>;

function TriStateFeatureChips({
  chips, state, onChange, otherValue, onOtherChange,
}: {
  chips: string[];
  state: FeatureState;
  onChange: (s: FeatureState) => void;
  otherValue: string;
  onOtherChange: (v: string) => void;
}) {
  const cycle = (chip: string) => {
    const cur = state[chip] ?? 0;
    const next: 0 | 1 | 2 = cur === 0 ? 1 : cur === 1 ? 2 : 0;
    onChange({ ...state, [chip]: next });
  };

  const niceToHave = chips.filter(c => (state[c] ?? 0) === 1);
  const mustHave   = chips.filter(c => (state[c] ?? 0) === 2);

  // Also include "other" text as a virtual entry in the nice-to-have list preview
  const hasSelections = niceToHave.length > 0 || mustHave.length > 0;

  return (
    <div>
      {/* Hint */}
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 4, marginBottom: 8, lineHeight: 1.5 }}>
        Tap once for{" "}
        <span style={{ color: "var(--miami-blue)", fontWeight: 700 }}>Nice to Have</span>
        {" "}· tap again for{" "}
        <span style={{ color: "var(--gelbgrun)", fontWeight: 700 }}>Must Have</span>
        {" "}· tap a third time to clear.
      </p>

      {/* Chip grid */}
      <div className="flex flex-wrap gap-2">
        {chips.map(chip => {
          const s = state[chip] ?? 0;
          const isNice = s === 1;
          const isMust = s === 2;
          return (
            <button
              key={chip}
              type="button"
              onClick={() => cycle(chip)}
              className="px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 active:scale-95"
              style={{
                background: isMust
                  ? "rgba(173,240,41,0.15)"
                  : isNice
                  ? "rgba(31,195,239,0.15)"
                  : "rgba(255,255,255,0.07)",
                color: isMust
                  ? "var(--gelbgrun)"
                  : isNice
                  ? "var(--miami-blue)"
                  : "rgba(255,255,255,0.75)",
                border: `1px solid ${
                  isMust
                    ? "rgba(173,240,41,0.35)"
                    : isNice
                    ? "rgba(31,195,239,0.35)"
                    : "rgba(255,255,255,0.12)"
                }`,
                fontFamily: "Industry, sans-serif",
                minHeight: 40,
              }}
              data-testid={`chip-feature-${chip.replace(/\W+/g, "_")}`}
            >
              {isMust ? "★ " : isNice ? "✓ " : ""}{chip}
            </button>
          );
        })}
      </div>

      {/* Other text input */}
      <div className="mt-3">
        <input
          className="intake-input"
          placeholder="Other (type anything else...)"
          value={otherValue}
          onChange={e => onOtherChange(e.target.value)}
          data-testid="input-feature-other"
        />
      </div>

      {/* Dynamic selection list */}
      {hasSelections && (
        <div className="mt-4 rounded-xl p-4 flex flex-col gap-3"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Your Selection
          </p>

          {mustHave.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--gelbgrun)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                ★ Must Have
              </p>
              <div className="flex flex-wrap gap-2">
                {mustHave.map(chip => (
                  <span
                    key={chip}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                    style={{
                      background: "rgba(173,240,41,0.12)",
                      color: "var(--gelbgrun)",
                      border: "1px solid rgba(173,240,41,0.3)",
                      fontFamily: "Industry, sans-serif",
                    }}
                  >
                    {chip}
                    <button
                      type="button"
                      onClick={() => onChange({ ...state, [chip]: 0 })}
                      style={{ color: "rgba(173,240,41,0.55)", fontSize: 14, lineHeight: 1 }}
                      className="hover:opacity-100 opacity-70 transition-opacity"
                    >×</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {niceToHave.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--miami-blue)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                ✓ Nice to Have
              </p>
              <div className="flex flex-wrap gap-2">
                {niceToHave.map(chip => (
                  <span
                    key={chip}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                    style={{
                      background: "rgba(31,195,239,0.1)",
                      color: "var(--miami-blue)",
                      border: "1px solid rgba(31,195,239,0.25)",
                      fontFamily: "Industry, sans-serif",
                    }}
                  >
                    {chip}
                    <button
                      type="button"
                      onClick={() => onChange({ ...state, [chip]: 0 })}
                      style={{ color: "rgba(31,195,239,0.55)", fontSize: 14, lineHeight: 1 }}
                      className="hover:opacity-100 opacity-70 transition-opacity"
                    >×</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>{label}</span>
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

  // Pre-populate form from existing client record when first loaded
  const [namePrefilled, setNamePrefilled] = useState(false);
  if (existingClient && !namePrefilled) {
    if (existingClient.firstName || existingClient.lastName) {
      setForm(prev => ({
        ...prev,
        firstName: prev.firstName || existingClient.firstName || "",
        lastName: prev.lastName || existingClient.lastName || "",
        priorityRankings: Object.keys(prev.priorityRankings).length === 0
          ? (() => {
              try { return JSON.parse((existingClient as any).priorityRankings || "{}"); }
              catch { return {}; }
            })()
          : prev.priorityRankings,
      }));
    }
    setNamePrefilled(true);
  }

  const set = (field: keyof FormData, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value }));

  // Derive preferred/not-interested from tri-state
  const preferredMakes = Object.entries(makesState).filter(([,v]) => v === 1).map(([k]) => k);
  const notInterestedMakes = Object.entries(makesState).filter(([,v]) => v === -1).map(([k]) => k);


  // Build the API payload — maps form state to schema column names
  const buildPayload = (data: FormData) => {
    // Map passengerRequirement → reuse passengerCount column
    // Map secondRowPreference → reuse suvSeatConfig column
    // "Anything additional?" maps to mustHaveFeatures column
    const childrenJson = JSON.stringify(
      data.childrenRiding === "yes" ? data.childrenInVehicle.filter(c => c.age.trim() || c.seatType) : []
    );
    return {
      ...data,
      bodyStyles: JSON.stringify(data.bodyStyles),
      preferredMakes: JSON.stringify(preferredMakes),
      notInterestedMakes: JSON.stringify(notInterestedMakes),
      exteriorColors: JSON.stringify(data.exteriorColors),
      interiorColors: JSON.stringify(data.interiorColors),
      householdVehicles: JSON.stringify(data.householdVehicles),
      // Catch-all field reuses must_have_features column
      mustHaveFeatures: data.additionalNotes,
      additionalNotes: data.additionalNotes,
      // Clear out the legacy nice-to-have field
      niceToHaveFeatures: "",
      // New chip lists
      safetyTechFeatures: JSON.stringify(data.safetyTechFeatures),
      comfortFeatures: JSON.stringify(data.comfortFeatures),
      // New scalar fields
      budgetPriorityStance: data.budgetPriorityStance,
      primaryUseCases: JSON.stringify(data.primaryUseCases),
      specialUseCases: data.specialUseCases,
      passengerRequirement: data.passengerRequirement,
      // Reuse passenger_count column to also store the new requirement
      passengerCount: data.passengerRequirement,
      childrenInVehicle: childrenJson,
      dogSpace: data.dogSpace,
      thirdRowUsage: data.thirdRowUsage,
      secondRowPreference: data.secondRowPreference,
      // Reuse suv_seat_config to also hold second-row preference
      suvSeatConfig: data.secondRowPreference,
      homeCharging: data.homeCharging,
      priorityRankings: JSON.stringify(data.priorityRankings),
    };
  };

  // Save questionnaire and mark complete
  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = buildPayload(data);
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
    apiRequest("PATCH", `/api/clients/${clientId}/questionnaire`, buildPayload(data)).catch(() => {});
  };

  const [showHvError, setShowHvError] = useState(false);

  const validateStep = () => {
    if (isUAT) return true;
    if (step === 0) {
      return !!(form.firstName.trim() && form.lastName.trim());
    }
    if (step === 1) {
      if (!form.purchaseType) return false;
      if (!form.timeframe) return false;
      if (!form.annualMileage) return false;
      if (!form.budgetPriorityStance) return false;
      return true;
    }
    if (step === 2) {
      if (form.primaryUseCases.length === 0) return false;
      if (form.bodyStyles.length === 0) return false;
      if (!form.passengerRequirement) return false;
      if (!form.powertrain) return false;
      if (isEVorPHEV && !form.homeCharging) return false;
      return true;
    }
    return true;
  };

  const next = () => {
    // Strip any completely-empty household vehicle rows before validating/saving
    const cleanedVehicles = form.householdVehicles.filter(v => v.year.trim() || v.make.trim());
    if (cleanedVehicles.length !== form.householdVehicles.length) {
      set("householdVehicles", cleanedVehicles);
    }
    // Check for partially-filled rows (one field filled but not the other)
    const incomplete = cleanedVehicles.some(v => !v.year.trim() || !v.make.trim());
    if (incomplete) {
      setShowHvError(true);
      toast({ title: "Incomplete vehicle", description: "Please fill in both year and make, or remove the row.", variant: "destructive" });
      return;
    }
    setShowHvError(false);
    if (!validateStep()) {
      toast({ title: "Please fill required fields", description: "Complete the highlighted fields before continuing.", variant: "destructive" });
      return;
    }
    if (step < STEPS.length - 1) {
      // Save with cleaned vehicles
      saveProgress({ ...form, householdVehicles: cleanedVehicles });
      setStep(s => s + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      mutation.mutate({ ...form, householdVehicles: cleanedVehicles });
    }
  };

  const back = () => {
    setStep(s => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isUAT = existingClient ? isUATSession(existingClient.email ?? "", existingClient.phone ?? "") : false;

  const clientName = existingClient
    ? `${existingClient.firstName} ${existingClient.lastName}`
    : "";

  // ── Household vehicles helpers ──
  const addHouseholdVehicle = () => {
    if (form.householdVehicles.length >= 4) return;
    set("householdVehicles", [...form.householdVehicles, { year: "", make: "", model: "", trim: "" }]);
  };
  const removeHouseholdVehicle = (i: number) => {
    const updated = form.householdVehicles.filter((_, idx) => idx !== i);
    set("householdVehicles", updated);
    // Clear any validation toast that may have fired before the row was removed
    setShowHvError(false);
  };
  const updateHouseholdVehicle = (i: number, field: "year" | "make" | "model" | "trim", value: string) => {
    const updated = form.householdVehicles.map((v, idx) => idx === i ? { ...v, [field]: value } : v);
    set("householdVehicles", updated);
  };

  // ── Children helpers ──
  const addChild = () =>
    set("childrenInVehicle", [...form.childrenInVehicle, { age: "", seatType: "" }]);
  const removeChild = (i: number) => {
    set("childrenInVehicle", form.childrenInVehicle.filter((_, idx) => idx !== i));
  };
  const updateChild = (i: number, field: "age" | "seatType", value: string) => {
    const updated = form.childrenInVehicle.map((c, idx) =>
      idx === i ? { ...c, [field]: value as ChildEntry["seatType"] | string } : c
    );
    set("childrenInVehicle", updated);
  };

  // Whether passenger requirement implies passengers besides the 2 adults
  const passengersInclude = form.passengerRequirement === "2_adults_1_2" || form.passengerRequirement === "2_adults_3_plus";
  const hasSUV3Row = form.bodyStyles.includes("SUV 3-row");
  const isEVorPHEV = form.powertrain === "ev" || form.powertrain === "phev";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(160deg, #002639 0%, #004363 60%, #003552 100%)" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5 border-b flex-shrink-0" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <MotoLogoFull height={30} />
        <div style={{ color: "rgba(255,255,255,0.82)", fontSize: 12 }}>
          {clientName && <span className="hidden sm:inline" style={{ color: "rgba(255,255,255,0.85)", marginRight: 8 }}>{clientName} ·</span>}
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
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
              {step === 0 && "Your contact and registration details."}
              {step === 1 && "Help us understand your budget and financing goals."}
              {step === 2 && "What kind of vehicle are you looking for?"}
              {step === 3 && "Do you have a vehicle to trade in?"}
              {step === 4 && "What matters most to you in a vehicle?"}
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

            {/* ── Step 2: Financial Profile ── */}
            {step === 1 && (
              <div className="flex flex-col gap-5 md:gap-6">
                <Field label="Purchase Type *">
                  <ToggleGroup
                    options={[["finance","Finance"],["lease","Lease"],["cash","Cash"]]}
                    value={form.purchaseType}
                    onChange={v => set("purchaseType", v)}
                    testPrefix="btn-purchase"
                  />
                </Field>

                <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }} />

                {/* Free-form currency inputs (accept ranges like "50-60k") */}
                <FieldRow>
                  <Field label="Budget" hint="a number or a range, e.g. 50-60k">
                    <input className="intake-input" placeholder="$35,000 or 30-40k" value={form.budget}
                      onChange={e => set("budget", e.target.value)}
                      data-testid="input-budget" />
                  </Field>
                  <Field label="Monthly Payment Target" hint="a number or a range">
                    <input className="intake-input" placeholder="$499 or 450-550" value={form.monthlyPayment}
                      onChange={e => set("monthlyPayment", e.target.value)}
                      data-testid="input-monthly" />
                  </Field>
                </FieldRow>

                <Field label="Down Payment" hint="a number or a range">
                  <input className="intake-input" placeholder="$5,000 or 3-7k" value={form.downPayment}
                    onChange={e => set("downPayment", e.target.value)}
                    data-testid="input-down-payment" />
                </Field>

                <FieldRow>
                  <Field label="Credit Score">
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

                <Field label="Annual Miles *">
                  <ToggleGroup
                    options={ANNUAL_MILEAGE.map(m => [m, m] as [string, string])}
                    value={form.annualMileage}
                    onChange={v => set("annualMileage", v)}
                    testPrefix="btn-miles"
                  />
                </Field>

                <Field label="Budget Priority Stance *" hint="how strict is your ceiling?">
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 4, marginBottom: 6, lineHeight: 1.5 }}>
                    Helps us calibrate trade-offs between fit and price.
                  </p>
                  <div className="flex flex-col gap-2 mt-1">
                    {([
                      ["perfect_car", "Perfect car matters most"],
                      ["balanced", "Balanced"],
                      ["budget_ceiling", "Budget is the ceiling"],
                    ] as [string, string][]).map(([v, l]) => (
                      <button key={v} type="button" onClick={() => set("budgetPriorityStance", v)}
                        className="rounded-xl font-bold transition-all text-left"
                        style={{
                          background: form.budgetPriorityStance === v ? "var(--miami-blue)" : "rgba(255,255,255,0.07)",
                          color: form.budgetPriorityStance === v ? "var(--shelby-blue)" : "rgba(255,255,255,0.85)",
                          border: `1px solid ${form.budgetPriorityStance === v ? "var(--miami-blue)" : "rgba(255,255,255,0.1)"}`,
                          fontFamily: "Industry, sans-serif",
                          fontSize: 13,
                          minHeight: 44,
                          padding: "10px 14px",
                        }}
                        data-testid={`btn-bps-${v}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </Field>

              </div>
            )}

            {/* ── Step 3: Vehicle Preferences ── */}
            {step === 2 && (
              <div className="flex flex-col gap-5">

                {/* USE & LIFESTYLE */}
                <SectionDivider label="Use & Lifestyle" />
                <Field label="Primary Use Cases *" hint="select all that apply">
                  <MultiSelect
                    options={PRIMARY_USE_CASES}
                    value={form.primaryUseCases}
                    onChange={v => set("primaryUseCases", v)}
                  />
                </Field>
                <Field label="Special Use Cases" hint="optional">
                  <textarea
                    className="intake-input"
                    placeholder="Car camping, teen drivers, mobility needs, anything else..."
                    value={form.specialUseCases}
                    onChange={e => set("specialUseCases", e.target.value)}
                    rows={3}
                    style={{ resize: "vertical", minHeight: 76 }}
                    data-testid="input-special-use-cases"
                  />
                </Field>

                {/* BODY STYLE & SIZE */}
                <SectionDivider label="Body Style & Size" />
                <Field label="Body Styles *" hint="select all that apply">
                  <MultiSelect options={BODY_STYLES} value={form.bodyStyles} onChange={v => set("bodyStyles", v)} />
                </Field>

                <Field label="Passengers in this vehicle *">
                  <div className="flex flex-col gap-2 mt-1">
                    {([
                      ["just_me", "Just me"],
                      ["2_adults", "2 adults"],
                      ["2_adults_1_2", "2 adults + 1–2 passengers"],
                      ["2_adults_3_plus", "2 adults + 3+ passengers"],
                    ] as [string, string][]).map(([v, l]) => (
                      <button key={v} type="button" onClick={() => set("passengerRequirement", v)}
                        className="rounded-xl font-bold transition-all text-left"
                        style={{
                          background: form.passengerRequirement === v ? "var(--miami-blue)" : "rgba(255,255,255,0.07)",
                          color: form.passengerRequirement === v ? "var(--shelby-blue)" : "rgba(255,255,255,0.85)",
                          border: `1px solid ${form.passengerRequirement === v ? "var(--miami-blue)" : "rgba(255,255,255,0.1)"}`,
                          fontFamily: "Industry, sans-serif",
                          fontSize: 13,
                          minHeight: 44,
                          padding: "10px 14px",
                        }}
                        data-testid={`btn-pax-${v}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </Field>

                {passengersInclude && (
                  <div className="rounded-xl p-4 flex flex-col gap-4 animate-in"
                    style={{ background: "rgba(31,195,239,0.05)", border: "1px solid rgba(31,195,239,0.12)" }}>
                    <Field label="Will any children be riding?">
                      <ToggleGroup
                        options={[["yes","Yes"],["no","No"]]}
                        value={form.childrenRiding}
                        onChange={v => set("childrenRiding", v)}
                        testPrefix="btn-children-riding"
                      />
                    </Field>

                    {form.childrenRiding === "yes" && (
                      <div>
                        <label className="intake-label">Children</label>
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 4, marginBottom: 8, lineHeight: 1.5 }}>
                          For each child, enter the age and seat type. Helps us flag interior space and seat-mounting requirements.
                        </p>
                        <div className="flex flex-col gap-2 mb-3">
                          {(form.childrenInVehicle.length === 0 ? [{ age: "", seatType: "" as ChildEntry["seatType"] }] : form.childrenInVehicle).map((c, i) => {
                            // Lazy-init: ensure form has at least 1 row when first opened
                            if (form.childrenInVehicle.length === 0 && i === 0) {
                              // We render a placeholder row but it's not yet in state — commit on first edit
                            }
                            const seatOptions: [ChildEntry["seatType"], string][] = [
                              ["car_seat", "Car Seat"],
                              ["booster", "Booster"],
                              ["neither", "Neither"],
                            ];
                            const ensureRow = () => {
                              if (form.childrenInVehicle.length === 0) {
                                set("childrenInVehicle", [{ age: "", seatType: "" }]);
                              }
                            };
                            return (
                              <div key={i} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                <input
                                  className="intake-input"
                                  placeholder="Age"
                                  inputMode="numeric"
                                  style={{ maxWidth: 120 }}
                                  value={c.age}
                                  onFocus={ensureRow}
                                  onChange={e => {
                                    if (form.childrenInVehicle.length === 0) {
                                      set("childrenInVehicle", [{ age: e.target.value, seatType: "" }]);
                                    } else {
                                      updateChild(i, "age", e.target.value);
                                    }
                                  }}
                                  data-testid={`input-child-age-${i}`}
                                />
                                <div className="flex gap-1 flex-wrap">
                                  {seatOptions.map(([v, l]) => (
                                    <button
                                      key={v}
                                      type="button"
                                      onClick={() => {
                                        if (form.childrenInVehicle.length === 0) {
                                          set("childrenInVehicle", [{ age: "", seatType: v }]);
                                        } else {
                                          updateChild(i, "seatType", v as string);
                                        }
                                      }}
                                      className="px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150"
                                      style={{
                                        background: c.seatType === v ? "var(--miami-blue)" : "rgba(255,255,255,0.07)",
                                        color: c.seatType === v ? "var(--shelby-blue)" : "rgba(255,255,255,0.75)",
                                        border: `1px solid ${c.seatType === v ? "var(--miami-blue)" : "rgba(255,255,255,0.1)"}`,
                                        fontFamily: "Industry, sans-serif",
                                        minHeight: 40,
                                      }}
                                      data-testid={`btn-child-${i}-${v}`}
                                    >
                                      {l}
                                    </button>
                                  ))}
                                </div>
                                {form.childrenInVehicle.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => removeChild(i)}
                                    style={{ color: "rgba(255,255,255,0.78)", fontSize: 20, minWidth: 36, minHeight: 36 }}
                                    className="flex items-center justify-center hover:text-red-400 transition-colors"
                                    data-testid={`btn-remove-child-${i}`}
                                  >×</button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={addChild}
                          data-testid="btn-add-child"
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
                          + Add child
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <Field label="Do we need to account for dog space?">
                  <ToggleGroup
                    options={[["yes","Yes"],["no","No"]]}
                    value={form.dogSpace}
                    onChange={v => set("dogSpace", v)}
                    testPrefix="btn-dog-space"
                  />
                </Field>

                {hasSUV3Row && (
                  <div className="rounded-xl p-4 flex flex-col gap-4 animate-in"
                    style={{ background: "rgba(31,195,239,0.05)", border: "1px solid rgba(31,195,239,0.12)" }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "var(--miami-blue)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      3-Row SUV Details
                    </p>
                    <Field label="3rd-Row Usage Intent">
                      <ToggleGroup
                        options={[
                          ["daily", "Regular daily use"],
                          ["occasional", "Occasional guests"],
                          ["rarely", "Rarely — just need the option"],
                        ]}
                        value={form.thirdRowUsage}
                        onChange={v => set("thirdRowUsage", v)}
                        testPrefix="btn-3rd-row"
                      />
                    </Field>
                    <Field label="2nd-Row Seating Preference">
                      <div className="flex flex-col gap-2 mt-1">
                        {([
                          ["bench_only", "Bench only"],
                          ["bench_preferred", "Bench preferred"],
                          ["captains_only", "Captain's only"],
                          ["captains_preferred", "Captain's preferred"],
                          ["captains_if_necessary", "Captain's if necessary"],
                          ["no_preference", "No preference"],
                        ] as [string, string][]).map(([v, l]) => (
                          <button key={v} type="button" onClick={() => set("secondRowPreference", v)}
                            className="rounded-xl font-bold transition-all text-left"
                            style={{
                              background: form.secondRowPreference === v ? "var(--miami-blue)" : "rgba(255,255,255,0.07)",
                              color: form.secondRowPreference === v ? "var(--shelby-blue)" : "rgba(255,255,255,0.85)",
                              border: `1px solid ${form.secondRowPreference === v ? "var(--miami-blue)" : "rgba(255,255,255,0.1)"}`,
                              fontFamily: "Industry, sans-serif",
                              fontSize: 13,
                              minHeight: 40,
                              padding: "8px 14px",
                            }}
                            data-testid={`btn-2nd-row-${v}`}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                )}

                {/* MAKES & MODELS */}
                <SectionDivider label="Makes & Models" />
                <div>
                  <label className="intake-label">Preferred / Not-interested Makes</label>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 4, marginBottom: 6, lineHeight: 1.5 }}>
                    Tap once for ✓ preferred (green) · tap again for ✕ not interested (red) · tap again to clear.
                    You don't have to weigh in on every brand — just the ones that matter to you.
                  </p>
                  <TriStateMakes makes={MAKES} state={makesState} onChange={setMakesState} />
                </div>
                <Field label="Specific Models of Interest">
                  <input className="intake-input" placeholder="e.g. RAV4, F-150, 3 Series..." value={form.preferredModels}
                    onChange={e => set("preferredModels", e.target.value)} data-testid="input-models" />
                </Field>

                {/* POWERTRAIN */}
                <SectionDivider label="Powertrain" />
                <Field label="Powertrain *">
                  <div className="flex flex-col gap-2 mt-1">
                    {([
                      ["gas", "Gasoline"],
                      ["hybrid", "Hybrid (no plug)"],
                      ["phev", "PHEV"],
                      ["ev", "Fully Electric"],
                      ["indifferent", "Open to guidance"],
                    ] as [string, string][]).map(([v, l]) => (
                      <button key={v} type="button" onClick={() => set("powertrain", v)}
                        className="rounded-xl font-bold transition-all text-left"
                        style={{
                          background: form.powertrain === v ? "var(--miami-blue)" : "rgba(255,255,255,0.07)",
                          color: form.powertrain === v ? "var(--shelby-blue)" : "rgba(255,255,255,0.85)",
                          border: `1px solid ${form.powertrain === v ? "var(--miami-blue)" : "rgba(255,255,255,0.1)"}`,
                          fontFamily: "Industry, sans-serif",
                          fontSize: 13,
                          minHeight: 44,
                          padding: "10px 14px",
                        }}
                        data-testid={`btn-powertrain-${v}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </Field>

                {isEVorPHEV && (
                  <Field label="Home Charging Situation *">
                    <div className="flex flex-col gap-2 mt-1">
                      {([
                        ["level2", "Dedicated home charger (Level 2)"],
                        ["level1", "Standard outlet only (Level 1)"],
                        ["no_charging", "No home charging — apartment/condo"],
                        ["na", "N/A"],
                      ] as [string, string][]).map(([v, l]) => (
                        <button key={v} type="button" onClick={() => set("homeCharging", v)}
                          className="rounded-xl font-bold transition-all text-left"
                          style={{
                            background: form.homeCharging === v ? "var(--miami-blue)" : "rgba(255,255,255,0.07)",
                            color: form.homeCharging === v ? "var(--shelby-blue)" : "rgba(255,255,255,0.85)",
                            border: `1px solid ${form.homeCharging === v ? "var(--miami-blue)" : "rgba(255,255,255,0.1)"}`,
                            fontFamily: "Industry, sans-serif",
                            fontSize: 13,
                            minHeight: 44,
                            padding: "10px 14px",
                          }}
                          data-testid={`btn-home-charging-${v}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </Field>
                )}

                {/* SAFETY & TECHNOLOGY */}
                <SectionDivider label="Safety & Technology" />
                <Field label="Safety & Tech Features" hint="select all that apply">
                  <MultiSelect
                    options={SAFETY_TECH_CHIPS}
                    value={form.safetyTechFeatures}
                    onChange={v => set("safetyTechFeatures", v)}
                  />
                </Field>

                {/* COMFORT & INTERIOR */}
                <SectionDivider label="Comfort & Interior" />
                <Field label="Comfort Features" hint="select all that apply">
                  <MultiSelect
                    options={COMFORT_CHIPS}
                    value={form.comfortFeatures}
                    onChange={v => set("comfortFeatures", v)}
                  />
                </Field>

                {/* COLORS */}
                <SectionDivider label="Colors" />
                <Field label="Exterior Colors" hint="select all that apply">
                  <MultiSelect options={EXTERIOR_COLORS} value={form.exteriorColors} onChange={v => set("exteriorColors", v)} />
                </Field>
                <Field label="Interior Colors" hint="select all that apply">
                  <MultiSelect options={INTERIOR_COLORS} value={form.interiorColors} onChange={v => set("interiorColors", v)} />
                </Field>

                {/* ANYTHING ADDITIONAL */}
                <SectionDivider label="Anything additional?" />
                <Field label="Anything additional?">
                  <textarea
                    className="intake-input"
                    placeholder="Any remaining must-haves, hard deal-breakers, or special requirements we haven't covered?"
                    value={form.additionalNotes}
                    onChange={e => set("additionalNotes", e.target.value)}
                    rows={4}
                    style={{ resize: "vertical", minHeight: 96 }}
                    data-testid="input-additional-notes"
                  />
                </Field>

                {/* LIFESTYLE & PERKS */}
                <SectionDivider label="Lifestyle & Perks" />
                <Field label="Costco Member (3+ months)?">
                  <ToggleGroup
                    options={[["standard","Yes"],["none","No"]]}
                    value={form.costcoMembership === "executive" ? "standard" : form.costcoMembership}
                    onChange={v => set("costcoMembership", v)}
                    testPrefix="btn-costco"
                  />
                </Field>
                <Field label="Active Military / Veteran?">
                  <ToggleGroup
                    options={[["yes","Yes"],["no","No"]]}
                    value={form.isVeteran}
                    onChange={v => set("isVeteran", v)}
                    testPrefix="btn-veteran"
                  />
                </Field>

                <div>
                  <label className="intake-label">
                    Household Vehicles currently owned
                    <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.82)", fontSize: 11, marginLeft: 6 }}>(up to 4)</span>
                  </label>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 4, marginBottom: 8, lineHeight: 1.5 }}>
                    Existing brand ownership can unlock loyalty pricing.
                  </p>
                  {form.householdVehicles.length > 0 && (
                    <div className="flex flex-col gap-2 mb-3">
                      {form.householdVehicles.map((v, i) => {
                        const rowIncomplete = showHvError && (!v.year.trim() || !v.make.trim());
                        return (
                          <div key={i} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                            <input
                              className="intake-input"
                              placeholder="Year"
                              style={{ maxWidth: 100 }}
                              value={v.year}
                              onChange={e => { updateHouseholdVehicle(i, "year", e.target.value); setShowHvError(false); }}
                              data-testid={`input-hv-year-${i}`}
                            />
                            <input
                              className="intake-input flex-1"
                              placeholder="Make"
                              value={v.make}
                              onChange={e => { updateHouseholdVehicle(i, "make", e.target.value); setShowHvError(false); }}
                              data-testid={`input-hv-make-${i}`}
                              style={rowIncomplete && !v.make.trim() ? { borderColor: "#ef4444" } : {}}
                            />
                            <input
                              className="intake-input flex-1"
                              placeholder="Model"
                              value={v.model || ""}
                              onChange={e => updateHouseholdVehicle(i, "model", e.target.value)}
                              data-testid={`input-hv-model-${i}`}
                            />
                            <input
                              className="intake-input flex-1"
                              placeholder="Trim"
                              value={v.trim || ""}
                              onChange={e => updateHouseholdVehicle(i, "trim", e.target.value)}
                              data-testid={`input-hv-trim-${i}`}
                            />
                            <button
                              type="button"
                              onClick={() => removeHouseholdVehicle(i)}
                              style={{ color: "rgba(255,255,255,0.78)", fontSize: 20, minWidth: 36, minHeight: 36, flexShrink: 0 }}
                              className="flex items-center justify-center hover:text-red-400 transition-colors"
                              data-testid={`btn-remove-hv-${i}`}
                            >×</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {form.householdVehicles.length < 4 && (
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
                  )}
                </div>
              </div>
            )}

            {/* ── Step 4: Trade-In ── */}
            {step === 3 && ( // eslint-disable-line no-constant-binary-expression
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
                    <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 14 }}>
                      No trade-in — got it. After submitting, you'll be prompted to upload your key documents.
                    </p>
                  </div>
                )}
              </div>
            )}
            {/* ── Step 5: Priority Rankings ── */}
            {step === 4 && (
              <div className="flex flex-col gap-5">
                <PriorityRankingStep
                  rankings={form.priorityRankings}
                  onChange={(r) => set("priorityRankings", r)}
                />
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
                  color: "rgba(255,255,255,0.9)",
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

          <p className="hidden md:block text-center mt-4" style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
            Your progress is saved automatically. You can return at any time.
          </p>
        </div>
      </main>

      {/* UAT floating toolbar */}
      {isUAT && <UATToolbar clientId={clientId} current="intake" />}

      {/* ── Mobile sticky bottom navigation bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-4 py-3"
        style={{ background: "rgba(0,38,57,0.97)", borderTop: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(12px)" }}>
        <div className="flex gap-3 max-w-lg mx-auto">
          {step > 0 ? (
            <button onClick={back} data-testid="btn-back-mobile"
              className="rounded-xl font-bold transition-all active:scale-95"
              style={{
                background: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.9)",
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
        <p className="text-center mt-2" style={{ fontSize: 11, color: "rgba(255,255,255,0.78)" }}>
          Progress saved automatically
        </p>
      </div>
    </div>
  );
}
