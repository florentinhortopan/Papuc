/**
 * Nightly scout digest — light, email-client-safe HTML (tables + inline CSS).
 * Design tokens from Stitch Papuc digest + UX Pro newsletter palette.
 */

import {
  emailFromAddress,
  getResendClient,
  siteOrigin,
} from "@/lib/email/resend";

/** Product gate: only new deals at or above this score enter digests. */
export const DIGEST_MIN_SCORE = 30;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export type DigestDeal = {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  score: number;
  dscr: number | null;
  monthlyCashflow: number | null;
  imageUrl: string | null;
};

export type DigestProject = {
  projectId: string;
  projectName: string;
  deals: DigestDeal[];
};

export type ScoutDigestInput = {
  to: string;
  displayName?: string | null;
  projects: DigestProject[];
  /** Defaults to DIGEST_MIN_SCORE — kept injectable for tests. */
  minScore?: number;
};

function formatMoney(n: number): string {
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}

function dealLabel(d: DigestDeal): string {
  if (d.address?.trim()) return d.address.trim();
  if (d.city && d.state) return `${d.city}, ${d.state}`;
  return "Address pending";
}

function placeLine(d: DigestDeal): string {
  return [d.city, d.state].filter(Boolean).join(", ");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Only embed absolute https images — skip everything else. */
export function safeHttpsImageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function metricCell(label: string, value: string, emphasize = false): string {
  const valueColor = emphasize ? "#7C5CFF" : "#1A1A1A";
  return `<td width="33%" valign="top" style="padding:0 4px;text-align:center;">
  <div style="font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#64748B;line-height:16px;margin:0 0 4px;">${label}</div>
  <div style="font-size:18px;font-weight:700;color:${valueColor};line-height:24px;">${escapeHtml(value)}</div>
</td>`;
}

function dealCardHtml(d: DigestDeal, origin: string): string {
  const href = `${origin}/deals/${d.id}`;
  const label = dealLabel(d);
  const place = placeLine(d);
  const cf =
    d.monthlyCashflow != null ? `${formatMoney(d.monthlyCashflow)}/mo` : "—";
  const dscr =
    d.dscr != null && Number.isFinite(d.dscr) ? d.dscr.toFixed(2) : "—";
  const score = String(Math.round(d.score));
  const img = safeHttpsImageUrl(d.imageUrl);

  const media = img
    ? `<img src="${escapeHtml(img)}" width="552" alt="${escapeHtml(label)}" style="display:block;width:100%;max-width:552px;height:auto;border:0;border-radius:4px 4px 0 0;" />`
    : `<div style="background:#F1F5F9;color:#64748B;font-size:13px;text-align:center;padding:48px 16px;border-radius:4px 4px 0 0;">No photo</div>`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border:1px solid #E2E8F0;border-radius:4px;overflow:hidden;background:#FFFFFF;">
  <tr>
    <td style="padding:0;line-height:0;font-size:0;">
      <a href="${href}" style="text-decoration:none;">${media}</a>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 20px 20px;">
      <a href="${href}" style="color:#7C5CFF;font-size:16px;font-weight:600;line-height:24px;text-decoration:none;">${escapeHtml(label)}</a>
      ${
        place
          ? `<div style="color:#64748B;font-size:13px;line-height:20px;margin:4px 0 12px;">${escapeHtml(place)}</div>`
          : `<div style="margin:0 0 12px;"></div>`
      }
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
        <tr>
          ${metricCell("Score", score, true)}
          ${metricCell("DSCR", dscr)}
          ${metricCell("Cashflow", cf)}
        </tr>
      </table>
      <a href="${href}" style="display:inline-block;background:#7C5CFF;color:#FFFFFF;font-size:14px;font-weight:600;line-height:20px;text-decoration:none;padding:10px 16px;border-radius:4px;">View deal</a>
    </td>
  </tr>
</table>`;
}

export function buildScoutDigestContent(input: ScoutDigestInput): {
  subject: string;
  html: string;
  text: string;
  totalDeals: number;
} {
  const origin = siteOrigin();
  const minScore = input.minScore ?? DIGEST_MIN_SCORE;
  const totalDeals = input.projects.reduce((n, p) => n + p.deals.length, 0);
  const projectCount = input.projects.length;
  const subject =
    projectCount === 1
      ? `${totalDeals} new deal${totalDeals === 1 ? "" : "s"} — ${input.projects[0]!.projectName}`
      : `${totalDeals} new deals across ${projectCount} projects`;

  const greeting = input.displayName?.trim()
    ? `Hi ${input.displayName.trim()},`
    : "Hi,";

  const projectBlocksHtml = input.projects
    .map((p) => {
      const cards = p.deals
        .slice(0, 5)
        .map((d) => dealCardHtml(d, origin))
        .join("");
      const more =
        p.deals.length > 5
          ? `<p style="color:#64748B;font-size:13px;line-height:20px;margin:0 0 8px;">+${p.deals.length - 5} more on this project</p>`
          : "";
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px;">
  <tr>
    <td style="padding:0 0 12px;border-bottom:3px solid #001F3F;">
      <a href="${origin}/projects/${p.projectId}" style="color:#001F3F;font-size:16px;font-weight:600;line-height:24px;text-decoration:none;">${escapeHtml(p.projectName)}</a>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 0 0;">
      ${cards}
      ${more}
      <p style="margin:8px 0 0;">
        <a href="${origin}/projects/${p.projectId}" style="color:#7C5CFF;font-size:13px;font-weight:600;text-decoration:none;">Open project →</a>
      </p>
    </td>
  </tr>
</table>`;
    })
    .join("");

  const hostPath = `${origin.replace(/^https?:\/\//, "")}/projects`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#FCF9F8;font-family:${FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FCF9F8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:4px;">
          <tr>
            <td style="padding:24px 24px 8px;">
              <div style="font-size:24px;font-weight:700;line-height:32px;letter-spacing:-0.02em;color:#001F3F;margin:0;">Papuc</div>
              <div style="font-size:13px;line-height:20px;color:#64748B;margin:4px 0 0;">Nightly scout digest</div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 8px;font-size:15px;line-height:24px;color:#1A1A1A;">
              ${escapeHtml(greeting)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;font-size:15px;line-height:24px;color:#1A1A1A;">
              Your overnight scout found <strong>${totalDeals}</strong> new
              deal${totalDeals === 1 ? "" : "s"} (score ≥ ${minScore}).
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 8px;">
              ${projectBlocksHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 28px;font-size:12px;line-height:18px;color:#64748B;">
              You're receiving this because Nightly scout is on for these projects.
              Manage projects at
              <a href="${origin}/projects" style="color:#7C5CFF;text-decoration:none;">${escapeHtml(hostPath)}</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
    greeting,
    "",
    `Your overnight scout found ${totalDeals} new deal${totalDeals === 1 ? "" : "s"} (score ≥ ${minScore}).`,
    "",
  ];
  for (const p of input.projects) {
    textLines.push(`${p.projectName} — ${origin}/projects/${p.projectId}`);
    for (const d of p.deals.slice(0, 5)) {
      const cf =
        d.monthlyCashflow != null
          ? `${formatMoney(d.monthlyCashflow)}/mo`
          : "—";
      const dscr =
        d.dscr != null && Number.isFinite(d.dscr) ? d.dscr.toFixed(2) : "—";
      textLines.push(
        `  • ${dealLabel(d)} — score ${Math.round(d.score)}, DSCR ${dscr}, ${cf}`,
      );
      textLines.push(`    ${origin}/deals/${d.id}`);
    }
    if (p.deals.length > 5) {
      textLines.push(`  +${p.deals.length - 5} more`);
    }
    textLines.push("");
  }
  textLines.push(`Manage projects: ${origin}/projects`);

  return { subject, html, text: textLines.join("\n"), totalDeals };
}

/**
 * Send one nightly digest. Returns null if Resend is not configured;
 * throws on API failure so the cron can record it.
 */
export async function sendScoutDigest(
  input: ScoutDigestInput,
): Promise<{ id: string } | null> {
  if (input.projects.every((p) => p.deals.length === 0)) return null;

  const resend = getResendClient();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY missing — scout digest skipped");
    return null;
  }

  const { subject, html, text } = buildScoutDigestContent(input);
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
