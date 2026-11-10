import Link from "next/link";
import { LinkButton } from "@/components/ui";
export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <p className="t-label">404</p>
      <h1 className="t-h1">We can&apos;t find that page</h1>
      <p className="text-muted">It may have moved, or you may not have access to it.</p>
      <div className="flex gap-3">
        <LinkButton href="/">Home</LinkButton>
        <LinkButton href="/sign-in" variant="secondary">
          Sign in
        </LinkButton>
      </div>
      <Link href="/contact" className="text-sm underline">
        Contact us
      </Link>
    </main>
  );
}
