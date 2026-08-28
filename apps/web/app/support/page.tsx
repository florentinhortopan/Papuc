import type { Metadata } from "next";

import { PAGE_DESCRIPTIONS, SITE_FAQ } from "@/lib/site-meta";

export const metadata: Metadata = {
  title: "Support",
  description: PAGE_DESCRIPTIONS.support,
};

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-zinc-200">
      <h1 className="text-3xl font-semibold text-white">Support</h1>
      <p className="mt-6 text-sm leading-relaxed text-zinc-300">
        Need help with Papuc web or the iOS app (TestFlight)? Email{" "}
        <a
          className="text-violet-400 underline"
          href="mailto:de.barbatosf@gmail.com"
        >
          de.barbatosf@gmail.com
        </a>{" "}
        or open an issue in the product chat with screenshots of the Debug
        footer (API URL, build, error).
      </p>
      <p className="mt-4 text-sm text-zinc-400">
        For App Store / account deletion requests, include the email on your
        Papuc account.
      </p>

      <section className="mt-12 space-y-6">
        <h2 className="text-xl font-semibold text-white">FAQ</h2>
        {SITE_FAQ.map((item) => (
          <div key={item.question}>
            <h3 className="text-sm font-semibold text-white">{item.question}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              {item.answer}
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}
