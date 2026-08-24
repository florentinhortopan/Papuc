import { emailFromAddress, siteOrigin } from "@/lib/email/resend";

export const ADMIN_EMAIL_MAX_RECIPIENTS = 100;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain body → simple HTML paragraphs + matching text. */
export function buildAdminMessageContent(body: string): {
  html: string;
  text: string;
} {
  const trimmed = body.replace(/\r\n/g, "\n").trim();
  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const origin = siteOrigin();
  const htmlParts = paragraphs.map(
    (p) =>
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#1a1a1a">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`,
  );
  htmlParts.push(
    `<p style="margin:24px 0 0;font-size:12px;color:#888">— Papuc · <a href="${escapeHtml(origin)}">${escapeHtml(origin)}</a></p>`,
  );
  return {
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px">${htmlParts.join("")}</div>`,
    text: `${trimmed}\n\n— Papuc\n${origin}`,
  };
}

function resendApiKey(): string {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("RESEND_API_KEY missing");
  return key;
}

/**
 * Send via Resend HTTP API (not the SDK) so non-JSON error bodies from
 * Resend/proxies become readable messages instead of SyntaxError noise.
 */
export async function sendAdminMessage(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ id: string }> {
  const subject = input.subject.trim();
  if (!subject) throw new Error("subject required");
  if (!input.body.trim()) throw new Error("body required");
  const to = input.to.trim().toLowerCase();
  if (!to.includes("@")) throw new Error(`invalid recipient: ${input.to}`);

  const { html, text } = buildAdminMessageContent(input.body);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFromAddress(),
      to: [to],
      subject,
      html,
      text,
    }),
  });

  const raw = await res.text();
  let parsed: { id?: string; message?: string; name?: string; error?: unknown } =
    {};
  if (raw.trim()) {
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      throw new Error(
        `Resend HTTP ${res.status}: ${raw.slice(0, 240).trim() || "(empty body)"}`,
      );
    }
  }

  if (!res.ok) {
    const msg =
      (typeof parsed.message === "string" && parsed.message) ||
      (typeof parsed.name === "string" && parsed.name) ||
      raw.slice(0, 240) ||
      `Resend HTTP ${res.status}`;
    throw new Error(msg);
  }

  return { id: parsed.id ?? "unknown" };
}
