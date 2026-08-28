import { redirect } from "next/navigation";

import { MarketingLanding } from "@/components/marketing-landing";
import { createClient } from "@/lib/supabase/server";

export default async function RootPage() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/home");
  } catch {
    // Missing Supabase env (e.g. misconfigured preview) — still serve landing.
  }

  return <MarketingLanding />;
}
