import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://tora-player.vercel.app"),
  title: "נגן תורה",
  description: "שיעורי הרב אליהו מציון בניהו בן יהוידע — להאזנה, להורדה ולהאזנה לא מקוונת",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "נגן תורה",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "he_IL",
    siteName: "נגן תורה",
    title: "נגן תורה",
    description: "שיעורי הרב אליהו מציון בניהו בן יהוידע",
    images: [{ url: "/brand/og.jpg", width: 1200, height: 630, alt: "נגן תורה" }],
  },
  twitter: { card: "summary_large_image", images: ["/brand/og.jpg"] },
};

export const viewport: Viewport = {
  themeColor: "#121212",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Note: <html> and <body> are rendered in the locale layout (src/app/[locale]/layout.tsx)
  // The root layout just passes children through to avoid duplicate html/body elements.
  return children;
}
