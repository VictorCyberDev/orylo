import { Skeleton } from "@/components/ui";
export default function Loading() {
  return (
    <main id="main" aria-busy="true" aria-live="polite" className="mx-auto max-w-5xl space-y-4 px-4 py-10">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-40 w-full" />
    </main>
  );
}
