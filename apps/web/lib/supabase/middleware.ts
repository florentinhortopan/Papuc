import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Public marketing + share funnel. "/api/*" is not cookie-gated: mobile sends
// Bearer tokens and each route handler enforces auth.
const PUBLIC_PREFIXES = [
  "/sign-in",
  "/auth/callback",
  "/api",
  "/share",
  "/privacy",
  "/support",
];

const PUBLIC_EXACT = new Set(["/"]);

function isPublicPath(path: string): boolean {
  if (PUBLIC_EXACT.has(path)) return true;
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

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
  const isPublic = isPublicPath(path);

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
