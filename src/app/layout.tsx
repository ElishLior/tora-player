import type { Metadata, Viewport } from "next";
import { FEED_PATH, OG_LOCALE, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/config/site";
import "./globals.css";

// Open Graph images come from ./opengraph-image.tsx (lesson pages have their
// own); the manifest from ./manifest.ts. Pages set title/description, and the
// title template appends the site name.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME.he, template: `%s · ${SITE_NAME.he}` },
  description: SITE_DESCRIPTION.he,
  applicationName: SITE_NAME.he,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: SITE_NAME.he,
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  alternates: {
    types: { "application/rss+xml": [{ url: FEED_PATH, title: SITE_NAME.he }] },
  },
  openGraph: {
    type: "website",
    locale: OG_LOCALE.he,
    siteName: SITE_NAME.he,
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#121212",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Note: <html> and <body> are rendered in the locale layout (src/app/[locale]/layout.tsx)
  // and in src/app/not-found.tsx. The root layout just passes children through.
  return children;
}
