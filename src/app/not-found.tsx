import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16 text-center">
      <h1 className="font-heading text-3xl">Page not found</h1>
      <p className="text-lg text-muted">
        This page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link href="/" className="text-primary underline">
        Go to the home page
      </Link>
    </main>
  );
}
