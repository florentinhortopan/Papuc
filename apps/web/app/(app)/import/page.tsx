import { ImportListingClient } from "@/components/import-listing-client";
import { listProjects } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Import listing — Papuc" };
export const dynamic = "force-dynamic";

export default async function ImportListingPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; projectId?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const projects = await listProjects(supabase).catch(() => []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Import listing</h1>
        <p className="text-textMuted text-sm mt-1 max-w-lg leading-6">
          Paste a Zillow, Redfin, Realtor, or Homes.com URL — or a street
          address — to pull it into Papuc underwriting. Discover search and
          Voice Concierge use the same path when you name a specific property.
        </p>
      </div>
      <ImportListingClient
        projects={projects}
        initialUrl={typeof sp.url === "string" ? sp.url : ""}
        initialProjectId={typeof sp.projectId === "string" ? sp.projectId : ""}
      />
    </div>
  );
}
