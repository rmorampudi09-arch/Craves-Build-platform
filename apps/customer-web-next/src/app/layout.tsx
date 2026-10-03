import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";

import { CartKitchenReplacementDialogHost } from "@/components/cart/CartKitchenReplacementDialogHost";
import { BottomNav } from "@/components/layout/BottomNav";
import { StructuredData } from "@/components/seo/StructuredData";
import { cravesLogoUrl, cravesSiteGraph, seoKeywords, siteUrl } from "@/lib/seo-craves";

import "../styles.css";
import "../craves-theme.css";
import "../otp-overrides.css";
import "../control-border-overrides.css";

const displayFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-craves-display",
});

const bodyFont = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-craves-body",
});

const canonicalLogo = "/brand/craves-logo-20260805.png";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Craves",
  title: {
    default: "Craves — Homemade Food from Trusted Home Chefs",
    template: "%s – Craves",
  },
  description:
    "Discover homemade food, trusted home chefs, live dishes, secure checkout, and delivery-supported ordering in Hyderabad and Bangalore with Craves.",
  keywords: seoKeywords(),
  authors: [{ name: "Craves" }],
  robots: { index: true, follow: true },
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: "Craves — Homemade Food from Trusted Home Chefs",
    description:
      "Discover homemade food, trusted home chefs, live dishes, secure checkout, and delivery-supported ordering with Craves.",
    url: siteUrl,
    siteName: "Craves",
    images: [{ url: cravesLogoUrl, width: 512, height: 512, alt: "Craves" }],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Craves — Homemade Food from Trusted Home Chefs",
    description:
      "Homemade food discovery and home-chef ordering for Hyderabad and Bangalore.",
    images: [cravesLogoUrl],
  },
  icons: {
    icon: canonicalLogo,
    shortcut: canonicalLogo,
    apple: canonicalLogo,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F62E18",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable}`}
    >
      <body>
        <StructuredData data={cravesSiteGraph()} />
        {children}
        <BottomNav />
        <CartKitchenReplacementDialogHost />
      </body>
    </html>
  );
}
