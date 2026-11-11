import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { headers } from "next/headers";
import "./globals.css";
import { brand } from "@/config/brand";
import { ToastProvider } from "@/components/client";
import { EgainChat } from "@/components/egain-chat";
import { getEgainConfig } from "@/config/egain";

export const metadata: Metadata = {
  metadataBase: new URL(brand.siteUrl),
  title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
  openGraph: {
    title: `${brand.name} — ${brand.category}`,
    description: brand.description,
    siteName: brand.name,
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: brand.themeColor.light },
    { media: "(prefers-color-scheme: dark)", color: brand.themeColor.dark },
  ],
  width: "device-width",
  initialScale: 1,
};

const themeInit = `try{var t=localStorage.getItem('orylo-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

// Dynamic rendering is required so every response can carry a fresh CSP nonce (see src/proxy.ts).
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const eg = getEgainConfig();
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <ToastProvider>{children}</ToastProvider>
        <EgainChat
          config={{
            enabled: eg.enabled,
            agentId: eg.agentId,
            serverUrl: eg.serverUrl,
            scriptUrl: eg.scriptUrl,
            standaloneUrl: eg.standaloneUrl,
            nonce,
          }}
        />
      </body>
    </html>
  );
}
