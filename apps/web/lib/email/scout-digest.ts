import {
  emailFromAddress,
  getResendClient,
  siteOrigin,
} from "@/lib/email/resend";

export type DigestDeal = {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  score: number;
  dscr: number | null;
  monthlyCashflow: number | null;
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildScoutDigestContent(input: ScoutDigestInput): {
  subject: string;
  html: string;
  text: string;
  totalDeals: number;
} {
  const origin = siteOrigin();
  const totalDeals = input.projects.reduce((n, p) => n + p.deals.length, 0);
  const projectCount = input.projects.length;
  const subject =
    projectCount === 1
      ? `${totalDeals} new high-score deal${totalDeals === 1 ? "" : "s"} — ${input.projects[0]!.projectName}`
      : `${totalDeals} new high-score deals across ${projectCount} projects`;

  const greeting = input.displayName?.trim()
    ? `Hi ${input.displayName.trim()},`
    : "Hi,";

  const projectBlocksHtml = input.projects
    .map((p) => {
      const rows = p.deals
        .slice(0, 5)
        .map((d) => {
          const href = `${origin}/deals/${d.id}`;
          const cf =
            d.monthlyCashflow != null
              ? `${formatMoney(d.monthlyCashflow)}/mo`
              : "—";
          const dscr =
            d.dscr != null && Number.isFinite(d.dscr)
              ? d.dscr.toFixed(2)
              : "—";
          return `<tr>
  <td style="padding:10px 0;border-bottom:1px solid #2a2a36;">
    <a href="${href}" style="color:#7c5cff;font-weight:600;text-decoration:none;">${escapeHtml(dealLabel(d))}</a>
    <div style="color:#8b8b96;font-size:12px;margin-top:4px;">
      Score ${Math.round(d.score)} · DSCR ${dscr} · ${cf}
    </div>
  </td>
</tr>`;
        })
        .join("");
      const more =
        p.deals.length > 5
          ? `<p style="color:#8b8b96;font-size:12px;margin:8px 0 0;">+${p.deals.length - 5} more on this project</p>`
          : "";
      return `<div style="margin:0 0 28px;">
  <h2 style="margin:0 0 8px;font-size:16px;color:#f5f5f7;">
    <a href="${origin}/projects/${p.projectId}" style="color:#f5f5f7;text-decoration:none;">${escapeHtml(p.projectName)}</a>
  </h2>
  <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  ${more}
  <p style="margin:12px 0 0;">
    <a href="${origin}/projects/${p.projectId}" style="color:#7c5cff;font-size:13px;">Open project →</a>
  </p>
</div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0b0b0f;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;color:#f5f5f7;">
    <p style="font-size:20px;font-weight:700;margin:0 0 4px;">Papuc</p>
    <p style="color:#8b8b96;font-size:13px;margin:0 0 24px;">Nightly scout digest</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 20px;">${escapeHtml(greeting)}</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 24px;">
      Your overnight scout found <strong>${totalDeals}</strong> new high-score
      deal${totalDeals === 1 ? "" : "s"} (score ≥ 70).
    </p>
    ${projectBlocksHtml}
    <p style="color:#8b8b96;font-size:12px;line-height:1.5;margin:32px 0 0;">
      You're receiving this because Nightly scout is on for these projects.
      Manage projects at <a href="${origin}/projects" style="color:#7c5cff;">${origin.replace(/^https?:\/\//, "")}/projects</a>.
    </p>
  </div>
</body>
</html>`;

  const textLines = [
    greeting,
    "",
    `Your overnight scout found ${totalDeals} new high-score deal${totalDeals === 1 ? "" : "s"} (score ≥ 70).`,
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
