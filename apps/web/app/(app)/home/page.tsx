import { FeedHomeClient } from "@/components/feed-home-client";
import { listFeedSections, type FeedSections } from "@/lib/feed";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomeFeedPage() {
  const supabase = await createClient();
  let sections: FeedSections = {
    bestRated: [],
    mostProfitable: [],
    latest: [],
  };
  try {
    sections = await listFeedSections(supabase);
  } catch {
    /* client can refresh; avoid hard-failing the shell */
  }

  return <FeedHomeClient initialSections={sections} />;
}
