import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/portal", "/api", "/invite"] }], sitemap: `${brand.siteUrl}/sitemap.xml` };
}
