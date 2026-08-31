import type { Metadata } from "next";
import { Suspense } from "react";

import { SignInForm } from "@/components/sign-in-form";
import { PAGE_DESCRIPTIONS, SITE_TAGLINE } from "@/lib/site-meta";

export const metadata: Metadata = {
  title: "Sign in",
  description: PAGE_DESCRIPTIONS.signIn,
};

export default function SignInPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2">Papuc</h1>
          <p className="text-textMuted text-sm">{SITE_TAGLINE}</p>
          <p className="text-textMuted text-xs mt-2 leading-5">
            Evaluate rentals with deal scenarios. Collaborate with investor
            friends.
          </p>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Sign in</h2>
          <Suspense fallback={null}>
            <SignInForm />
          </Suspense>
          <p className="text-textMuted text-xs leading-5 mt-4">
            We use Google OAuth via Supabase Auth. We never see your password.
          </p>
        </div>

        <p className="text-textMuted text-[11px] text-center mt-6 leading-5">
          Deal scenarios on Papuc are evaluation estimates, not lender quotes.
          Always verify with a licensed DSCR lender before offering.{" "}
          <a href="/terms" className="underline hover:text-text">
            Terms
          </a>
          {" · "}
          <a href="/privacy" className="underline hover:text-text">
            Privacy
          </a>
          {" · "}
          <a href="/data-disclaimer" className="underline hover:text-text">
            Data disclaimer
          </a>
        </p>
      </div>
    </main>
  );
}
