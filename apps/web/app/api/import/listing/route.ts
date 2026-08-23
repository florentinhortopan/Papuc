import { NextResponse } from "next/server";

import { importListingFromUrl } from "@/lib/import-listing";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Import a pasted listing URL into an owned project.
 * MVP: Zillow homedetails → HasData property → underwriteDeal upsert.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { url?: string; projectId?: string };
  try {
    body = (await req.json()) as { url?: string; projectId?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  const projectId = (body.projectId ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const result = await importListingFromUrl(supabase, {
    userId: user.id,
    projectId,
    urlText: url,
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
