// ─── UAT / Dev test account ────────────────────────────────────────────────
// When this email + phone combo logs in, UAT mode is automatically enabled.
// A floating toolbar lets Mike jump between portal stages without filling forms.

export const UAT_EMAIL = "mike.calcara@gmail.com";
export const UAT_PHONE = "9085914855"; // digits only, normalized

export function isUATSession(email: string, phone: string): boolean {
  return (
    email.trim().toLowerCase() === UAT_EMAIL &&
    phone.replace(/\D/g, "") === UAT_PHONE
  );
}
