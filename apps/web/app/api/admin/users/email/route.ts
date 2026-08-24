import { NextResponse } from "next/server";

import { assertAdmin } from "@/lib/admin";
import { getEmailsForUserIds } from "@/lib/admin-users";
import {
  ADMIN_EMAIL_MAX_RECIPIENTS,
  sendAdminMessage,
} from "@/lib/email/admin-message";
import { createRouteClient } from "@/lib/supabase/route-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createRouteClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const gate = assertAdmin(user);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { userIds?: string[]; subject?: string; body?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const userIds = Array.isArray(body.userIds)
    ? body.userIds.filter((id): id is string => typeof id === "string")
    : [];
  const subject = typeof body.subject === "string" ? body.subject : "";
  const message = typeof body.body === "string" ? body.body : "";

  if (userIds.length === 0) {
    return NextResponse.json({ error: "userIds required" }, { status: 400 });
  }
  if (userIds.length > ADMIN_EMAIL_MAX_RECIPIENTS) {
    return NextResponse.json(
      {
        error: `at most ${ADMIN_EMAIL_MAX_RECIPIENTS} recipients per send`,
      },
      { status: 400 },
    );
  }
  if (!subject.trim()) {
    return NextResponse.json({ error: "subject required" }, { status: 400 });
  }
  if (!message.trim()) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }

  try {
    const recipients = await getEmailsForUserIds(userIds);
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "no valid emails for selection" },
        { status: 400 },
      );
    }

    const sent: Array<{ id: string; email: string; messageId: string }> = [];
    const failed: Array<{ id: string; email: string; error: string }> = [];

    for (const r of recipients) {
      try {
        const result = await sendAdminMessage({
          to: r.email,
          subject,
          body: message,
        });
        sent.push({ id: r.id, email: r.email, messageId: result.id });
      } catch (err) {
        failed.push({
          id: r.id,
          email: r.email,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      ok: failed.length === 0,
      sent: sent.length,
      failed: failed.length,
      details: { sent, failed },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
