import { redirect } from "next/navigation";

import { AppNav } from "@/components/app-nav";
import { OnboardingDialog } from "@/components/onboarding-dialog";
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
      <AppNav />
      <main className="flex-1 container py-6">{children}</main>
      <OnboardingDialog />
    </div>
  );
}
