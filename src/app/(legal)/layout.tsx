import Link from "next/link";
import { brand } from "@/config/brand";

export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-foreground/10">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-heading text-2xl text-primary">
            {brand.name}
          </Link>
          <Link href="/signup" className="text-base text-primary underline">
            Start free trial
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">{children}</main>
    </div>
  );
}
