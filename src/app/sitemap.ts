import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";
import { solutions } from "@/content/solutions";
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "",
    "/product",
    "/solutions",
    ...solutions.map((s) => `/solutions/${s.slug}`),
    "/pricing",
    "/security",
    "/about",
    "/contact",
    "/demo",
    "/legal/privacy",
    "/legal/terms",
  ];
  return paths.map((p) => ({ url: `${brand.siteUrl}${p}`, lastModified: new Date("2026-11-10") }));
}
