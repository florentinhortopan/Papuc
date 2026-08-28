import type { Metadata } from "next";

import { PortfolioClient } from "@/components/portfolio-client";
import { listSavedDeals } from "@/lib/deals";
import { PAGE_DESCRIPTIONS } from "@/lib/site-meta";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portfolio",
  description: PAGE_DESCRIPTIONS.portfolio,
};
export default async function PortfolioPage() {
  const supabase = await createClient();
  const deals = await listSavedDeals(supabase).catch(() => []);
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Portfolio</h1>
        <p className="text-textMuted text-sm mt-1">
          Saved deals with cashflow and down payment from your scenario (or
          project defaults). Select deals to compare side by side.
        </p>
      </div>
      <PortfolioClient initialDeals={deals} />
    </div>
  );
}
