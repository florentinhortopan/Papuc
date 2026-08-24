import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy a deal's primary listing photo for Open Graph crawlers.
 * WhatsApp / Telegram / Messenger often refuse Zillow CDN hotlinks;
 * serving from our origin fixes empty previews.
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
  const { data, error } = await admin
    .from("deals")
    .select("photos, primary_image_url, address")
    .eq("share_token", token)
    .maybeSingle();
  if (error || !data) {
    return new NextResponse("Not found", { status: 404 });
  }

  const photos = Array.isArray(data.photos)
    ? (data.photos as unknown[]).filter(
        (p): p is string => typeof p === "string" && /^https:\/\//i.test(p),
      )
    : [];
  const primary =
    typeof data.primary_image_url === "string" &&
    /^https:\/\//i.test(data.primary_image_url)
      ? data.primary_image_url
      : null;
  const src = photos[0] ?? primary;
  if (!src || !isSafeRemoteImageUrl(src)) {
    return new NextResponse("No image", { status: 404 });
  }

  try {
    const upstream = await fetch(src, {
      headers: {
        Accept: "image/*,*/*",
        // Some CDNs soft-block empty UA; identify as Papuc OG proxy.
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
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
        "Content-Length": String(buf.length),
      },
    });
  } catch {
    return new NextResponse("Fetch failed", { status: 502 });
  }
}

/** Block SSRF: https only, no localhost / private nets. */
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
      // Allow only if clearly public — reject raw IPs to be safe.
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
