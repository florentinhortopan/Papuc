import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy the first deal photo on a shared project for Open Graph crawlers.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 8 || token.length > 64) {
    return new NextResponse("Not found", { status: 404 });
  }

  const admin = createAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .select("id")
    .eq("share_token", token)
    .maybeSingle();
  if (error || !project) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: deals } = await admin
    .from("deals")
    .select("photos, primary_image_url, last_refreshed_at")
    .eq("project_id", project.id)
    .order("last_refreshed_at", { ascending: false })
    .limit(8);

  let src: string | null = null;
  for (const deal of deals ?? []) {
    const photos = Array.isArray(deal.photos)
      ? (deal.photos as unknown[]).filter(
          (p): p is string => typeof p === "string" && /^https:\/\//i.test(p),
        )
      : [];
    const primary =
      typeof deal.primary_image_url === "string" &&
      /^https:\/\//i.test(deal.primary_image_url)
        ? deal.primary_image_url
        : null;
    src = photos[0] ?? primary;
    if (src) break;
  }
  if (!src || !isSafeRemoteImageUrl(src)) {
    return new NextResponse("No image", { status: 404 });
  }

  try {
    const upstream = await fetch(src, {
      headers: {
        Accept: "image/*,*/*",
        "User-Agent": "PapucOG/1.0 (+https://papuc.app)",
      },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });
    if (!upstream.ok) {
      return new NextResponse("Upstream error", { status: 502 });
    }
    const contentType = (
      upstream.headers.get("content-type") ?? "image/jpeg"
    ).split(";")[0]!.trim();
    if (!contentType.startsWith("image/")) {
      return new NextResponse("Not an image", { status: 502 });
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length < 200 || buf.length > 8_000_000) {
      return new NextResponse("Bad image size", { status: 502 });
    }
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control":
          "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        "Content-Length": String(buf.length),
      },
    });
  } catch {
    return new NextResponse("Fetch failed", { status: 502 });
  }
}

function isSafeRemoteImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host === "0.0.0.0" ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
