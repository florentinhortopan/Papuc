import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// "/share" is the public deal/project share landing — the top of the signup
// funnel. "/api/*" is intentionally not cookie-gated: mobile sends Bearer tokens
// and each route handler enforces auth (redirecting APIs to /sign-in HTML
// empties the iOS Discover feed).
const PUBLIC_PATHS = [
  "/sign-in",
  "/auth/callback",
  "/api",
  "/share",
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  // Preview (or any) deploy without Supabase env must not crash middleware —
  // Vercel surfaces that as MIDDLEWARE_INVOCATION_FAILED / 500.
  if (!supabaseUrl || !supabaseAnon) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
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
  });

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
