export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-zinc-200">
      <h1 className="text-3xl font-semibold text-white">Privacy Policy</h1>
      <p className="mt-4 text-sm text-zinc-400">Last updated: August 23, 2026</p>
      <div className="mt-8 space-y-4 text-sm leading-relaxed text-zinc-300">
        <p>
          Papuc (“we”) helps you scout investment real estate. We collect account
          information (email), project preferences you enter, listing data we
          fetch from third-party providers on your behalf, and optional device
          push tokens so we can notify you about new high-score deals.
        </p>
        <p>
          We use Supabase for authentication and data storage, Vercel for
          hosting, Resend for email digests, and Expo for push delivery. We do
          not sell your personal data.
        </p>
        <p>
          You can disable push alerts or email digests in Settings, and request
          account deletion by contacting support.
        </p>
        <p>
          Contact:{" "}
          <a className="text-violet-400 underline" href="/support">
            Support
          </a>
        </p>
      </div>
    </main>
  );
}
