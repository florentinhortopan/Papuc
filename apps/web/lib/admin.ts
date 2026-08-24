import type { User } from "@supabase/supabase-js";

/** Comma-separated allowlist from ADMIN_EMAILS (case-insensitive). */
export function parseAdminEmails(
  raw: string | undefined = process.env.ADMIN_EMAILS,
): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return parseAdminEmails().includes(normalized);
}

export function assertAdmin(user: User | null): {
  ok: true;
  email: string;
} | { ok: false; status: 401 | 403; error: string } {
  if (!user) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  const email = user.email?.trim() ?? "";
  if (!isAdminEmail(email)) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true, email };
}
