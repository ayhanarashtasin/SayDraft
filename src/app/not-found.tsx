import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="text-lg font-semibold">Page not found</p>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">The page you were looking for doesn&apos;t exist.</p>
      <Link href="/" className="btn btn-primary mt-5">
        Back to notes
      </Link>
    </div>
  );
}
