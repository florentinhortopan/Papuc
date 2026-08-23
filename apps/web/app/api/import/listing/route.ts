import { NextResponse } from "next/server";

import { importListingFromQuery } from "@/lib/import-listing";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Import a listing URL or street address into an owned project.
 * projectId is optional — uses the most recent project, or creates "Imports".
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { url?: string; query?: string; projectId?: string };
  try {
    body = (await req.json()) as {
      url?: string;
      query?: string;
      projectId?: string;
    };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const query = (body.query ?? body.url ?? "").trim();
  const projectId = (body.projectId ?? "").trim() || null;
  if (!query) {
    return NextResponse.json(
      { error: "url or query is required" },
      { status: 400 },
    );
  }

  const result = await importListingFromQuery(supabase, {
    userId: user.id,
    projectId,
    query,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  }

  return NextResponse.json({
    dealId: result.dealId,
    projectId: result.projectId,
    alreadyExisted: result.alreadyExisted,
    address: result.address,
    zpid: result.zpid,
    sourceUrl: result.sourceUrl,
    monthlyCashflow: result.monthlyCashflow,
    dscr: result.dscr,
    score: result.score,
  });
}
