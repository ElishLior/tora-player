import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "נגן תורה | Tora Player",
  description: "שיעורי תורה יומיים - Daily Torah Lessons",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "נגן תורה",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e3a5f",
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
