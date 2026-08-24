import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// "/share" is the public deal/project share landing — the top of the signup
// funnel. "/api/og" serves proxied listing photos for WhatsApp/Telegram crawlers.
const PUBLIC_PATHS = [
  "/sign-in",
  "/auth/callback",
  "/api/cron",
  "/api/og",
  "/share",
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options: CookieOptions;
          }>,
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && (path === "/sign-in" || path === "/")) {
    // Honor ?next= (e.g. a shared deal page) so already-signed-in users
    // clicking "unlock" land where they intended, not on /home.
    // Same-origin relative paths only — never redirect off-site.
    const next = request.nextUrl.searchParams.get("next");
    const target =
      next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";
    return NextResponse.redirect(new URL(target, request.url));
  }

  return response;
}
