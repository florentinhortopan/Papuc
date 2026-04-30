import { Suspense } from "react";

import { SignInForm } from "@/components/sign-in-form";

export const metadata = { title: "Sign in — Papuc" };

export default function SignInPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2">Papuc</h1>
          <p className="text-textMuted text-sm">
            DSCR-loan rental deals on autopilot.
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
          DSCR estimates shown in the app are investor underwriting estimates,
          not lender quotes.
        </p>
      </div>
    </main>
  );
}
