"use client";
import { Button } from "@/components/ui";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <h1 className="t-h1">Something went wrong</h1>
      <p className="text-muted">
        Nothing was changed by this error. You can try again; if it keeps happening, ask for a person.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
