import Link from "next/link";
import { brand } from "@/config/brand";
import { LinkButton } from "@/components/ui";
import { MobileNav, ThemeToggle } from "@/components/client";

const nav = [
  { href: "/product", label: "Product" },
  { href: "/solutions", label: "Solutions" },
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
  { href: "/about", label: "About" },
];
export function Wordmark() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 rounded-md font-semibold tracking-tight"
      aria-label={`${brand.name} home`}
    >
      <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="16" fill="var(--primary)" />
        <circle cx="32" cy="32" r="14" fill="none" stroke="var(--accent)" strokeWidth="6" />
        <path
          d="M25 33l5 5 10-12"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-lg">{brand.wordmark}</span>
    </Link>
  );
}
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="relative sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark />
          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-3 py-2 text-sm text-muted hover:text-fg"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Link
              href="/sign-in"
              className="hidden rounded-md px-3 py-2 text-sm text-muted hover:text-fg sm:inline"
            >
              Sign in
            </Link>
            <LinkButton href="/demo" size="sm" className="hidden sm:inline-flex">
              Try the demo
            </LinkButton>
            <MobileNav label="navigation">
              <nav aria-label="Mobile" className="flex flex-col">
                {[
                  ...nav,
                  { href: "/demo", label: "Try the demo" },
                  { href: "/contact", label: "Request access" },
                  { href: "/sign-in", label: "Sign in" },
                ].map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="flex min-h-12 items-center rounded-md px-2 text-base"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
            </MobileNav>
          </div>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="mt-24 border-t border-border bg-surface-2">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div className="space-y-3">
            <Wordmark />
            <p className="t-caption max-w-xs">
              {brand.category}. Working name; no trademark, domain or certification is claimed.
            </p>
          </div>
          <FooterCol
            title="Product"
            links={[
              ["/product", "How it works"],
              ["/solutions", "Solutions"],
              ["/pricing", "Early-access pricing"],
              ["/demo", "Live demo"],
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              ["/about", "About"],
              ["/security", "Security"],
              ["/contact", "Request access"],
            ]}
          />
          <FooterCol
            title="Legal"
            links={[
              ["/legal/privacy", "Privacy (draft)"],
              ["/legal/terms", "Terms (draft)"],
            ]}
          />
        </div>
        <p className="border-t border-border px-4 py-5 text-center t-caption">
          Demo data is entirely synthetic. © 2026 {brand.name} (working name).
        </p>
      </footer>
    </>
  );
}
function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="t-label mb-3">{title}</p>
      <ul className="space-y-1">
        {links.map(([h, l]) => (
          <li key={h}>
            <Link href={h} className="inline-flex min-h-9 items-center text-sm text-muted hover:text-fg">
              {l}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
