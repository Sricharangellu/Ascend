import Link from "next/link";

export const metadata = { title: "Page Not Found" };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-page-bg)] px-4 text-center">
      <p className="text-7xl font-bold text-[var(--color-primary)] opacity-20">404</p>
      <h1 className="mt-4 text-2xl font-bold text-[var(--color-text-primary)]">Page not found</h1>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/terminal"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
      >
        Back to terminal
      </Link>
    </div>
  );
}
