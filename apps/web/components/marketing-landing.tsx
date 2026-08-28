import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  SITE_FAQ,
  SITE_H1,
  SITE_HERO_SUPPORT,
  SITE_NAME,
  SITE_TAGLINE,
} from "@/lib/site-meta";

const PILLARS = [
  {
    title: "Evaluate with scenarios",
    body: "Paste a listing or scout a buy box. Change rent, rate, rehab, or expenses and watch DSCR and cash flow update — underwriting without the spreadsheet fog.",
  },
  {
    title: "Build your investor friends",
    body: "Follow people you trust, watch public projects, and grow a pool of partners. The Friends feed keeps ranked deals in one place.",
  },
  {
    title: "Share the scenario, not the Zillow link",
    body: "Pass a Papuc deal card with cash flow and DSCR already scored. Recipients see the conversation piece before they sign up.",
  },
] as const;

const STEPS = [
  {
    n: "1",
    title: "Describe what you want",
    body: "Talk or type a market, budget, and strategy. Papuc turns it into editable scout filters.",
  },
  {
    n: "2",
    title: "Run deal scenarios",
    body: "Every candidate gets cash flow, DSCR, and returns you can stress-test before you offer.",
  },
  {
    n: "3",
    title: "Collaborate and share",
    body: "Invite investor friends into the loop — follow, watch, and forward ranked deals.",
  },
] as const;

export function MarketingLanding() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-text"
          >
            {SITE_NAME}
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-in">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero — one composition: brand, H1, support, CTAs, visual plane */}
        <section className="relative overflow-hidden border-b border-border">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 70% 10%, rgba(124,92,255,0.22), transparent 55%), radial-gradient(ellipse 50% 40% at 10% 80%, rgba(61,220,151,0.08), transparent 50%)",
            }}
          />
          <div className="container relative py-16 sm:py-24 lg:py-28">
            <p className="text-primary text-sm font-semibold tracking-wide mb-4">
              {SITE_NAME}
            </p>
            <h1 className="max-w-3xl text-4xl sm:text-5xl lg:text-[3.25rem] font-bold tracking-tight leading-[1.1] text-text">
              {SITE_H1}
            </h1>
            <p className="mt-5 max-w-xl text-textMuted text-base sm:text-lg leading-7">
              {SITE_HERO_SUPPORT}
            </p>
            <p className="mt-3 text-textMuted text-sm">{SITE_TAGLINE}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/sign-in">Start evaluating</Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="#how">See how it works</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-b border-border py-16 sm:py-20">
          <div className="container">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight max-w-2xl">
              Two jobs. One platform.
            </h2>
            <p className="mt-3 text-textMuted text-sm sm:text-base max-w-xl leading-6">
              Evaluation clarity for you — social investing with the people you
              actually buy with.
            </p>
            <div className="mt-10 grid gap-10 sm:grid-cols-3">
              {PILLARS.map((p) => (
                <div key={p.title} className="min-w-0">
                  <h3 className="text-base font-semibold text-text">{p.title}</h3>
                  <p className="mt-2 text-sm text-textMuted leading-6">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="how"
          className="border-b border-border py-16 sm:py-20 scroll-mt-20"
        >
          <div className="container">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              How Papuc works
            </h2>
            <ol className="mt-10 grid gap-8 sm:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="min-w-0">
                  <span className="text-primary text-sm font-bold">{s.n}</span>
                  <h3 className="mt-2 text-base font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-textMuted leading-6">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="faq"
          className="border-b border-border py-16 sm:py-20 scroll-mt-20"
        >
          <div className="container max-w-3xl">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              FAQ
            </h2>
            <p className="mt-3 text-textMuted text-sm leading-6">
              Short answers for search and answer engines — same copy we publish
              as structured data.
            </p>
            <dl className="mt-10 space-y-8">
              {SITE_FAQ.map((item) => (
                <div key={item.question}>
                  <dt className="text-base font-semibold text-text">
                    {item.question}
                  </dt>
                  <dd className="mt-2 text-sm text-textMuted leading-6">
                    {item.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="py-16 sm:py-20">
          <div className="container text-center max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Ready to run a scenario?
            </h2>
            <p className="mt-3 text-textMuted text-sm sm:text-base leading-6">
              Sign in free. Scout a market, stress-test a listing, and invite
              investor friends into the deal.
            </p>
            <div className="mt-8 flex justify-center">
              <Button asChild size="lg">
                <Link href="/sign-in">Get started with Papuc</Link>
              </Button>
            </div>
            <p className="mt-8 text-textMuted text-[11px] leading-5 max-w-md mx-auto">
              Deal scenarios are evaluation estimates, not lender quotes. Always
              verify with a licensed DSCR lender before offering. Papuc is not a
              securities offering or crowdfunding portal.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="container flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm text-textMuted">
          <span className="font-semibold text-text">{SITE_NAME}</span>
          <nav className="flex flex-wrap gap-4">
            <Link href="/sign-in" className="hover:text-text">
              Sign in
            </Link>
            <Link href="/support" className="hover:text-text">
              Support
            </Link>
            <Link href="/privacy" className="hover:text-text">
              Privacy
            </Link>
            <Link href="#faq" className="hover:text-text">
              FAQ
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
