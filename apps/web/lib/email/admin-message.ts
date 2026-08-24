import {
  emailFromAddress,
  getResendClient,
  siteOrigin,
} from "@/lib/email/resend";

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

export async function sendAdminMessage(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ id: string }> {
  const resend = getResendClient();
  if (!resend) {
    throw new Error("RESEND_API_KEY missing");
  }
  const subject = input.subject.trim();
  if (!subject) throw new Error("subject required");
  if (!input.body.trim()) throw new Error("body required");
  const { html, text } = buildAdminMessageContent(input.body);
  const { data, error } = await resend.emails.send({
    from: emailFromAddress(),
    to: input.to,
    subject,
    html,
    text,
  });
  if (error) {
    throw new Error(error.message || "Resend send failed");
  }
  return { id: data?.id ?? "unknown" };
}
