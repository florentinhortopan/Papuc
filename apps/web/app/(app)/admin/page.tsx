import { redirect } from "next/navigation";

import { AdminUsersClient } from "@/components/admin-users-client";
import { isAdminEmail } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Admin — Papuc" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    redirect("/home");
  }

  return <AdminUsersClient />;
}
