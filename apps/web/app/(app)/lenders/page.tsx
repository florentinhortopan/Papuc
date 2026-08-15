import { Button } from "@/components/ui/button";
import { LENDERS } from "@/lib/lenders";

export const metadata = { title: "DSCR lenders — Papuc" };

export default function LendersPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">DSCR lenders</h1>
        <p className="text-textMuted text-sm mt-1">
          Curated investor-lender directory. Deal pages can match these to your
          live scenario — always confirm rates and terms directly with the
          lender.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {LENDERS.map((l) => (
          <div
            key={l.id}
            className="bg-surface border border-border rounded-2xl p-4"
          >
            <div className="flex items-start justify-between mb-1 gap-2">
              <p className="text-text text-lg font-semibold">{l.name}</p>
              <span className="text-textMuted text-xs shrink-0">
                Min DSCR {l.minDscr.toFixed(2)} · max LTV{" "}
                {(l.maxLtv * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-textMuted text-sm leading-5 mb-3">{l.notes}</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {l.badges.map((b) => (
                <span
                  key={b}
                  className="bg-surfaceAlt border border-border rounded-full px-2 py-1 text-xs"
                >
                  {b}
                </span>
              ))}
              {l.programs.map((p) => (
                <span
                  key={p}
                  className="bg-surfaceAlt border border-border rounded-full px-2 py-1 text-[10px] uppercase tracking-wide text-textMuted"
                >
                  {p.replace(/_/g, " ")}
                </span>
              ))}
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={l.url} target="_blank" rel="noopener noreferrer">
                Visit site
              </a>
            </Button>
          </div>
        ))}
      </div>

      <p className="text-textMuted text-xs mt-6 leading-5">
        Papuc underwriting estimates are not lender quotes. Lenders may apply
        75% rent factors, vacancy haircuts, reserves, and other adjustments.
        Always verify with a real lender before making an offer.
      </p>
    </div>
  );
}
