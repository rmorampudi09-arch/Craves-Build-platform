import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { PersistentCustomerServiceNav } from "@/components/navigation/PersistentCustomerServiceNav";
import "../styles.css";
import "../craves-theme.css";

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
  title: {
    default: "Craves — Homemade Meals from Trusted Home Chefs",
    template: "%s – Craves",
  },
  description:
    "Discover fresh homemade meals from trusted home chefs near you, delivered through Craves.",
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
      <body>
        <PersistentCustomerServiceNav />
        {children}
      </body>
    </html>
  );
}
