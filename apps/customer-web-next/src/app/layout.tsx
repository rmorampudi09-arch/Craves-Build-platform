import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { SITE_URL, SITE_DESCRIPTION } from "@/lib/public-seo";
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
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Craves | Homemade Food in Hyderabad",
    template: "%s | Craves",
  },
  description:
    SITE_DESCRIPTION,
  authors: [{ name: "Craves" }],
  robots: { index: true, follow: true },
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
      <body>{children}</body>
    </html>
  );
}
