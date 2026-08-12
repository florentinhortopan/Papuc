import { Resend } from "resend";

export function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

export function emailFromAddress(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    "Papuc <alerts@papuc.app>"
  );
}

export function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://www.papuc.app"
  );
}
