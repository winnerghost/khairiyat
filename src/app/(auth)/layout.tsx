import Link from "next/link";
import { brand } from "@/config/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto w-full max-w-md px-4 pt-6">
        <Link href="/" className="font-heading text-2xl text-primary">
          {brand.name}
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
