"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
    />
    <path
      fill="#EA4335"
      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"
    />
  </svg>
);

export function SignInForm() {
  const params = useSearchParams();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    params.get("error") === "auth_callback_failed"
      ? "Google sign-in could not finish. In Supabase → Authentication → URL Configuration, add this host’s /auth/callback (and the Vercel preview pattern https://*-florentin-hortopans-projects.vercel.app/**). Otherwise Supabase bounces you to production."
      : null,
  );

  const next = params.get("next") ?? "/home";

  async function signInWithGoogle() {
    if (!agreed) {
      setError("Please agree to the Terms, Privacy Policy, and Acceptable Use Policy to continue.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const supabase = createClient();
      // Always return to the host the user signed in on (papuc.app in
      // production). Do not use NEXT_PUBLIC_SITE_URL here — a stale
      // vercel.app value would bounce OAuth back to the wrong domain.
      const siteUrl = window.location.origin;
      const { error: e } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (e) throw e;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex gap-3 items-start cursor-pointer rounded-xl border border-border bg-background/50 p-3">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 rounded border-border"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span className="text-textMuted text-xs leading-5">
          I agree to the{" "}
          <Link href="/terms" className="text-primary underline" target="_blank">
            Terms of Service
          </Link>
          ,{" "}
          <Link
            href="/privacy"
            className="text-primary underline"
            target="_blank"
          >
            Privacy Policy
          </Link>
          , and{" "}
          <Link
            href="/acceptable-use"
            className="text-primary underline"
            target="_blank"
          >
            Acceptable Use Policy
          </Link>
          . See also our{" "}
          <Link
            href="/data-disclaimer"
            className="text-primary underline"
            target="_blank"
          >
            Data &amp; Listings Disclaimer
          </Link>
          .
        </span>
      </label>

      <Button
        variant="secondary"
        size="lg"
        onClick={signInWithGoogle}
        loading={submitting}
        disabled={!agreed}
        className="w-full"
      >
        <GoogleLogo />
        Continue with Google
      </Button>
      {error ? (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-3">
          <p className="text-danger text-xs">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
