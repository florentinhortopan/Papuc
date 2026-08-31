import { redirect } from "next/navigation";

import { AppAccessGates } from "@/components/app-access-gates";
import { AppNav } from "@/components/app-nav";
import { isAdminEmail } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav showAdmin={isAdminEmail(user.email)} />
      <main className="flex-1 container py-6">{children}</main>
      <AppAccessGates />
    </div>
  );
}
