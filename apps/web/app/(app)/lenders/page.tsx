import { Button } from "@/components/ui/button";
import { LENDERS } from "@/lib/lenders";

export const metadata = { title: "DSCR lenders — Papuc" };

export default function LendersPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">DSCR lenders</h1>
        <p className="text-textMuted text-sm mt-1">
          Public directory of common DSCR lenders. Always confirm rates and
          terms directly with the lender.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {LENDERS.map((l) => (
          <div
            key={l.name}
            className="bg-surface border border-border rounded-2xl p-4"
          >
            <div className="flex items-start justify-between mb-1">
              <p className="text-text text-lg font-semibold">{l.name}</p>
              <span className="text-textMuted text-xs">
                Min DSCR {l.minDscr.toFixed(2)}
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
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={l.url} target="_blank" rel="noopener noreferrer">
                Visit website
              </a>
            </Button>
          </div>
        ))}
      </div>

      <p className="text-textMuted text-[11px] mt-6 leading-5">
        Disclaimer: DSCR figures shown elsewhere in the app are investor
        underwriting estimates, not lender quotes. Lenders may apply 75% rent
        factor, vacancy adjustments, and other haircuts. Always verify before
        making an offer.
      </p>
    </div>
  );
}
