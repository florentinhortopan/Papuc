import { FeedHomeClient } from "@/components/feed-home-client";
import {
  listPersonalizedFeed,
  type PersonalizedFeed,
} from "@/lib/feed";
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
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      feed = await listPersonalizedFeed(supabase, user.id);
    }
  } catch {
    /* client can refresh; avoid hard-failing the shell */
  }

  return <FeedHomeClient initialFeed={feed} />;
}
