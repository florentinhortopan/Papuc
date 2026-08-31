import { Suspense } from "react";
import type { Metadata } from "next";

import { FeedHomeClient } from "@/components/feed-home-client";
import {
  listPersonalizedFeed,
  type PersonalizedFeed,
} from "@/lib/feed";
import { errorMessage } from "@/lib/error-message";
import { listProjects } from "@/lib/projects";
import { PAGE_DESCRIPTIONS } from "@/lib/site-meta";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discover",
  description: PAGE_DESCRIPTIONS.home,
};
const EMPTY: PersonalizedFeed = {
  forYou: [],
  newForYou: [],
  basedOnSearches: [],
  bestRated: [],
  mostProfitable: [],
  saved: [],
  skipped: [],
  friends: [],
  suggestedInvestors: [],
  taste: null,
  socialError: null,
};

export default async function HomeFeedPage() {
  const supabase = await createClient();
  let feed: PersonalizedFeed = EMPTY;
  let projectCount = 0;
  let loadError: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      try {
        feed = await listPersonalizedFeed(supabase, user.id);
      } catch (err) {
        loadError = errorMessage(err);
      }
      try {
        projectCount = (await listProjects(supabase)).length;
      } catch {
        /* project count is advisory; don't blank Discover for it */
      }
    }
  } catch (err) {
    loadError = loadError ?? errorMessage(err);
  }

  return (
    <Suspense fallback={<p className="text-textMuted text-sm">Loading…</p>}>
      <FeedHomeClient
        initialFeed={feed}
        projectCount={projectCount}
        initialLoadError={loadError}
      />
    </Suspense>
  );
}
