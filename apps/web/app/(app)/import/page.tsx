import { redirect } from "next/navigation";

/**
 * Import moved into a contextual sheet on Projects / project detail.
 * Keep this route as a soft redirect for old bookmarks and share links.
 */
export default async function ImportListingPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; projectId?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (typeof sp.url === "string" && sp.url) params.set("importUrl", sp.url);
  if (typeof sp.projectId === "string" && sp.projectId) {
    // Deep-link into that project; panel is available there with lock.
    redirect(`/projects/${sp.projectId}`);
  }
  const qs = params.toString();
  redirect(qs ? `/projects?${qs}` : "/projects");
}
