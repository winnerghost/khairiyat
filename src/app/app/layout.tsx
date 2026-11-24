import { AppHeader } from "@/components/family/app-header";
import { getEnv } from "@/lib/env";
import { isAdminEmail, requireUser } from "@/server/session";

export default async function FamilyAppLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser();
  const env = getEnv();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader isAdmin={isAdminEmail(user.email)} demo={env.isDemo} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
