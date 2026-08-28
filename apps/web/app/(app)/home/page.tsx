import { Suspense } from "react";

import { FeedHomeClient } from "@/components/feed-home-client";
import {
  listPersonalizedFeed,
  type PersonalizedFeed,
} from "@/lib/feed";
import { listProjects } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const EMPTY: PersonalizedFeed = {
  forYou: [],
  newForYou: [],
  basedOnSearches: [],
  bestRated: [],
  mostProfitable: [],
  saved: [],
  skipped: [],
  friends: [],
  taste: null,
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
      const [feedResult, projects] = await Promise.all([
        listPersonalizedFeed(supabase, user.id),
        listProjects(supabase),
      ]);
      feed = feedResult;
      projectCount = projects.length;
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
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
