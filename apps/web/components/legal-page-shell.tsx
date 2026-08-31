import Link from "next/link";
import type { ReactNode } from "react";

import {
  LEGAL_DOC_META,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSION,
  type LegalDocId,
} from "@/lib/legal";

export function LegalPageShell({
  docId,
  children,
}: {
  docId: LegalDocId;
  children: ReactNode;
}) {
  const meta = LEGAL_DOC_META[docId];
  const others = (Object.keys(LEGAL_DOC_META) as LegalDocId[]).filter(
    (id) => id !== docId,
  );

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-zinc-200">
      <p className="text-xs text-zinc-500 mb-4">
        <Link href="/" className="hover:text-zinc-300">
          Papuc
        </Link>
        <span className="mx-2">/</span>
        <span className="text-zinc-400">{meta.title}</span>
      </p>
      <h1 className="text-3xl font-semibold text-white">{meta.title}</h1>
      <p className="mt-4 text-sm text-zinc-400">
        Effective: {LEGAL_EFFECTIVE_DATE} · Version {LEGAL_VERSION}
      </p>
      <p className="mt-3 text-xs leading-5 text-zinc-500 border border-zinc-700/80 rounded-xl px-3 py-2 bg-zinc-900/40">
        Product draft for Papuc users. Have counsel review before treating as
        final compliance advice. Using Papuc means you agree to these terms as
        published.
      </p>
      <div className="mt-8 space-y-5 text-sm leading-relaxed text-zinc-300">
        {children}
      </div>
      <nav className="mt-12 pt-8 border-t border-zinc-800 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {others.map((id) => (
          <Link
            key={id}
            href={LEGAL_DOC_META[id].href}
            className="text-violet-400 underline hover:text-violet-300"
          >
            {LEGAL_DOC_META[id].title}
          </Link>
        ))}
        <Link
          href="/support"
          className="text-violet-400 underline hover:text-violet-300"
        >
          Support
        </Link>
      </nav>
    </main>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}
