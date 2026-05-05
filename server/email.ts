import { google } from "googleapis";
import { getOAuthClient } from "./drive";
import type { Client } from "@shared/schema";

// ─── Config ──────────────────────────────────────────────────────────────────
const NOTIFY_TO   = process.env.NOTIFY_EMAIL || "mike@motosaic.com";
const NOTIFY_FROM = process.env.NOTIFY_FROM_EMAIL || "mike@motosaic.com";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseJsonArr(str?: string | null): any[] {
  try { return JSON.parse(str || "[]"); } catch { return []; }
}

// ─── Label maps (mirror ClientDetailPage) ────────────────────────────────────
const BUDGET_STANCE_LABELS: Record<string, string> = {
  perfect_car: "Perfect car matters most",
  balanced: "Balanced",
  budget_ceiling: "Budget is the ceiling",
};
const PASSENGER_LABELS: Record<string, string> = {
  just_me: "Just me",
  "2_adults": "2 adults",
  "2_adults_1_2": "2 adults + 1\u20132 passengers",
  "2_adults_3_plus": "2 adults + 3+ passengers",
};
const THIRD_ROW_LABELS: Record<string, string> = {
  daily: "Regular daily use",
  occasional: "Occasional guests",
  rarely: "Rarely \u2014 just need the option",
};
const SECOND_ROW_LABELS: Record<string, string> = {
  bench_only: "Bench only",
  bench_preferred: "Bench preferred",
  captains_only: "Captain's only",
  captains_preferred: "Captain's preferred",
  captains_if_necessary: "Captain's if necessary",
  no_preference: "No preference",
};
const HOME_CHARGING_LABELS: Record<string, string> = {
  level2: "Dedicated home charger (Level 2)",
  level1: "Standard outlet only (Level 1)",
  no_charging: "No home charging \u2014 apartment/condo",
  na: "N/A",
};
const SEAT_TYPE_LABELS: Record<string, string> = {
  car_seat: "Car Seat",
  booster: "Booster",
  neither: "Neither",
};
function labelFor(val: string | null | undefined, map: Record<string, string>): string | null {
  if (!val) return null;
  return map[val] ?? val;
}
function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function row(label: string, value?: string | null): string {
  if (!value) return "";
  return `
    <tr>
      <td style="padding:6px 12px 6px 0;font-size:12px;color:#6b7280;font-weight:600;white-space:nowrap;vertical-align:top;width:180px;text-transform:uppercase;letter-spacing:0.04em;">${label}</td>
      <td style="padding:6px 0;font-size:13px;color:#111827;vertical-align:top;">${value}</td>
    </tr>`;
}

function section(title: string): string {
  return `
    <tr>
      <td colspan="2" style="padding:18px 0 4px;">
        <div style="background:#004363;color:#1FC3EF;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:6px 12px;border-radius:4px;">${title}</div>
      </td>
    </tr>`;
}

function divider(): string {
  return `<tr><td colspan="2" style="padding:2px 0 8px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0;"/></td></tr>`;
}

// ─── Build HTML body ──────────────────────────────────────────────────────────
function buildEmailHtml(client: Client): string {
  const c = client as any;
  const fullName = `${client.firstName} ${client.lastName}`.trim();
  const completedDate = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const adminUrl = `https://portal.motosaic.com/#/admin/clients/${client.id}`;

  // ── Priority rankings table
  let priorityHtml = "";
  if (c.priorityRankings) {
    try {
      const rankings: Record<string, string | number> = JSON.parse(c.priorityRankings);
      const sorted = Object.entries(rankings)
        .sort(([, a], [, b]) => (b === "na" ? -1 : a === "na" ? 1 : Number(b) - Number(a)));
      if (sorted.length > 0) {
        priorityHtml = section("Priorities (1=Low, 5=High)");
        for (const [cat, rank] of sorted) {
          const stars = rank === "na" ? "N/A" : `${"★".repeat(Number(rank))}${"☆".repeat(5 - Number(rank))} (${rank}/5)`;
          const color = rank === 5 ? "#15803d" : rank === "na" ? "#9ca3af" : "#111827";
          priorityHtml += `
            <tr>
              <td style="padding:5px 12px 5px 0;font-size:12px;color:#6b7280;font-weight:600;white-space:nowrap;width:180px;text-transform:uppercase;letter-spacing:0.04em;">${cat}</td>
              <td style="padding:5px 0;font-size:13px;color:${color};font-weight:${rank === 5 ? "700" : "400"};">${stars}</td>
            </tr>`;
        }
        priorityHtml += divider();
      }
    } catch { /* skip */ }
  }

  // ── Trade-in
  let tradeHtml = "";
  if (client.hasTradeIn) {
    const tradeDesc = [client.tradeYear, client.tradeMake, client.tradeModel, client.tradeTrim]
      .filter(Boolean).join(" ");
    tradeHtml = section("Trade-In Vehicle")
      + row("Vehicle", tradeDesc || "Yes — details not specified")
      + row("Mileage", client.tradeMileage)
      + row("Condition", client.tradeCondition)
      + row("Amount Owed", client.tradeOwed)
      + divider();
  }

  // ── Lifestyle
  const costco    = c.costcoMembership;
  const veteran   = c.isVeteran;
  const household = parseJsonArr(c.householdVehicles);
  let lifestyleHtml = "";
  if (costco || veteran || household.length > 0) {
    lifestyleHtml = section("Lifestyle & Background")
      + (costco ? row("Costco Membership", costco.charAt(0).toUpperCase() + costco.slice(1)) : "")
      + (veteran ? row("Veteran / Military", veteran === "yes" ? "Yes" : "No") : "")
      + (household.length > 0 ? row("Household Vehicles", household.map((v: any) => [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ")).filter(Boolean).join(", ")) : "")
      + divider();
  }

  const makes    = parseJsonArr(client.preferredMakes);
  const notMakes = parseJsonArr(c.notInterestedMakes);
  const bodies   = parseJsonArr(client.bodyStyles);
  const intColors = parseJsonArr(client.interiorColors);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">

  <div style="max-width:640px;margin:32px auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#004363;padding:28px 32px 20px;">
      <div style="font-size:22px;font-weight:800;color:#1FC3EF;letter-spacing:0.06em;">MOTOSAIC</div>
      <div style="font-size:11px;color:#E1F3F5;letter-spacing:0.1em;margin-top:2px;">QUESTIONNAIRE COMPLETE</div>
      <div style="margin-top:16px;">
        <div style="font-size:24px;font-weight:700;color:#ffffff;">${fullName}</div>
        <div style="font-size:13px;color:#93c5fd;margin-top:4px;">${completedDate}</div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div style="background:#EFF6FF;padding:14px 32px;border-bottom:1px solid #e5e7eb;display:flex;gap:12px;align-items:center;">
      <a href="${adminUrl}" style="display:inline-block;background:#1FC3EF;color:#004363;font-size:12px;font-weight:700;padding:8px 16px;border-radius:6px;text-decoration:none;letter-spacing:0.04em;">VIEW CLIENT IN ADMIN →</a>
      ${client.driveFolder ? `<a href="${client.driveFolder}" style="display:inline-block;background:#ffffff;border:1px solid #d1d5db;color:#374151;font-size:12px;font-weight:600;padding:8px 16px;border-radius:6px;text-decoration:none;">OPEN DRIVE FOLDER</a>` : ""}
    </div>

    <!-- Body -->
    <div style="padding:24px 32px;">
      <table style="width:100%;border-collapse:collapse;">

        ${section("Contact Information")}
        ${row("Name", fullName)}
        ${row("Email", `<a href="mailto:${client.email}" style="color:#1d4ed8;">${client.email}</a>`)}
        ${row("Phone", `<a href="tel:${client.phone}" style="color:#1d4ed8;">${client.phone}</a>`)}
        ${client.address ? row("Address", `${client.address}, ${client.city}, ${client.state} ${client.zip}`) : ""}
        ${divider()}

        ${section("Purchase Details")}
        ${row("Purchase Type", client.purchaseType?.toUpperCase())}
        ${row("Budget", client.budget)}
        ${row("Down Payment", client.downPayment)}
        ${row("Target Monthly", client.monthlyPayment)}
        ${row("Annual Mileage", client.annualMileage)}
        ${row("Credit Score", client.creditScore)}
        ${row("Timeframe", client.timeframe)}
        ${row("Budget Stance", labelFor(c.budgetPriorityStance, BUDGET_STANCE_LABELS))}
        ${row("Costco Member", costco ? costco.charAt(0).toUpperCase() + costco.slice(1) : null)}
        ${row("Veteran", veteran === "yes" ? "Yes" : veteran === "no" ? "No" : null)}
        ${divider()}

        ${section("Use & Lifestyle")}
        ${(() => { const arr = parseJsonArr(c.primaryUseCases); return arr.length > 0 ? row("Primary Uses", arr.join(", ")) : ""; })()}
        ${row("Special Use Cases", c.specialUseCases)}
        ${divider()}

        ${section("Body & Size")}
        ${bodies.length > 0 ? row("Body Styles", bodies.join(", ")) : ""}
        ${row("Passengers", labelFor(c.passengerRequirement || c.passengerCount, PASSENGER_LABELS))}
        ${c.childrenInVehicle ? (() => {
          const kids = parseJsonArr(c.childrenInVehicle);
          if (kids.length === 0) return "";
          const list = kids.map((k: any, i: number) => {
            const age = k.age != null && k.age !== "" ? `Age ${escapeHtml(String(k.age))}` : "Age —";
            const seat = labelFor(k.seatType, SEAT_TYPE_LABELS) || "—";
            return `Child ${i + 1}: ${age}, ${escapeHtml(seat)}`;
          }).join("<br/>");
          return row("Children in Vehicle", list);
        })() : ""}
        ${row("Dog Space", c.dogSpace === "yes" ? "Yes" : c.dogSpace === "no" ? "No" : null)}
        ${bodies.includes("SUV 3-row") ? (
          row("3rd Row Usage", labelFor(c.thirdRowUsage, THIRD_ROW_LABELS))
          + row("2nd Row Pref", labelFor(c.secondRowPreference || c.suvSeatConfig, SECOND_ROW_LABELS))
        ) : ""}
        ${divider()}

        ${section("Makes & Models")}
        ${makes.length > 0 ? row("Preferred Makes", makes.join(" · ")) : ""}
        ${notMakes.length > 0 ? row("Not Interested In", notMakes.join(", ")) : ""}
        ${row("Models in Mind", client.preferredModels)}
        ${divider()}

        ${section("Powertrain")}
        ${row("Powertrain", c.powertrain?.toUpperCase())}
        ${(c.powertrain === "ev" || c.powertrain === "phev") ? row("Home Charging", labelFor(c.homeCharging, HOME_CHARGING_LABELS)) : ""}
        ${divider()}

        ${(() => { const arr = parseJsonArr(c.safetyTechFeatures); return arr.length > 0 ? section("Safety & Technology") + row("Features", arr.join(", ")) + divider() : ""; })()}

        ${(() => { const arr = parseJsonArr(c.comfortFeatures); return arr.length > 0 ? section("Comfort & Interior") + row("Features", arr.join(", ")) + divider() : ""; })()}

        ${section("Colors")}
        ${row("Exterior Colors", client.exteriorColors)}
        ${intColors.length > 0 ? row("Interior Colors", intColors.join(", ")) : ""}
        ${divider()}

        ${(c.additionalNotes || client.mustHaveFeatures) ? section("Additional Notes") + row("Notes", c.additionalNotes || client.mustHaveFeatures) + divider() : ""}

        ${priorityHtml}

        ${tradeHtml}

        ${lifestyleHtml}

        ${client.notes ? section("Notes") + row("Notes", client.notes) + divider() : ""}

      </table>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;font-size:11px;color:#9ca3af;text-align:center;">
      Motosaic Client Portal &nbsp;·&nbsp; Client ID #${client.id} &nbsp;·&nbsp; <a href="${adminUrl}" style="color:#1FC3EF;">Open Admin</a>
    </div>

  </div>
</body>
</html>`;
}

// ─── Send via Gmail API ───────────────────────────────────────────────────────
function encodeEmail(to: string, from: string, subject: string, html: string): string {
  const message = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    html,
  ].join("\r\n");
  return Buffer.from(message).toString("base64url");
}

export async function sendQuestionnaireCompleteEmail(client: Client): Promise<void> {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    console.log("[email] No GOOGLE_REFRESH_TOKEN — skipping notification email");
    return;
  }

  const fullName = `${client.firstName} ${client.lastName}`.trim();
  const subject  = `${fullName} — Questionnaire Complete`;
  const html     = buildEmailHtml(client);

  try {
    const auth   = getOAuthClient();
    const gmail  = google.gmail({ version: "v1", auth });
    const raw    = encodeEmail(NOTIFY_TO, NOTIFY_FROM, subject, html);

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    console.log(`[email] Notification sent to ${NOTIFY_TO} for client #${client.id} — "${subject}"`);
  } catch (err) {
    // Non-fatal — log and continue
    console.error("[email] Failed to send notification:", err);
  }
}
