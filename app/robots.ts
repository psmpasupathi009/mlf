import type { MetadataRoute } from "next";

/** Private office portal — keep the whole site out of Google. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
