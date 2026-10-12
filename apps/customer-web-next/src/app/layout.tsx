import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";

import { CartKitchenReplacementDialogHost } from "@/features/cart/components/CartKitchenReplacementDialogHost";
import { BottomNav } from "@/features/customer-shell/components/BottomNav";
import { ChefModeGuard } from "@/features/chef/components/ChefModeGuard";
import { SessionEndedPrompt } from "@/features/auth/components/session-ended-prompt";
import { NewCustomerProfileGate } from "@/features/profile/components/new-customer-profile-gate";
import { MotionPreferences } from "@/shared/components/layout/MotionPreferences";
import { StructuredData } from "@/features/seo/components/StructuredData";
import { cravesSiteGraph, seoKeywords, shareImage, siteUrl } from "@/features/seo/lib/seo-craves";

import "../shared/styles/styles.css";
import "../shared/styles/craves-theme.css";
import "../features/sign-in/styles/otp-overrides.css";
import "../shared/ui/forms/code-slots.css";
import "../shared/styles/control-border-overrides.css";

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
    // Page titles already end in "| Craves"; appending again produced "… | Craves – Craves".
    template: "%s",
  },
  description:
    "Order fresh homemade food from trusted home chefs anywhere in Hyderabad and Bangalore. Home-style biryani, tiffin, breakfast, lunch, dinner and meal subscriptions, with secure checkout and delivery on Craves.",
  keywords: seoKeywords(),
  authors: [{ name: "Craves" }],
  robots: { index: true, follow: true },
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    images: [shareImage],
    title: "Craves — Homemade Food from Trusted Home Chefs",
    description:
      "Discover homemade food, trusted home chefs, live dishes, secure checkout, and delivery-supported ordering with Craves.",
    url: siteUrl,
    siteName: "Craves",
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    images: [shareImage],
    title: "Craves — Homemade Food from Trusted Home Chefs",
    description:
      "Homemade food discovery and home-chef ordering for Hyderabad and Bangalore.",
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
      // Lets Next jump to the top on navigation instead of animating under global smooth scroll.
      data-scroll-behavior="smooth"
    >
      <body>
        <StructuredData data={cravesSiteGraph()} />
        <MotionPreferences>
          {children}
          <BottomNav />
          <CartKitchenReplacementDialogHost />
          <ChefModeGuard />
          <NewCustomerProfileGate />
          <SessionEndedPrompt />
        </MotionPreferences>
      </body>
    </html>
  );
}
