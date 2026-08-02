import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "../styles.css";

export const metadata: Metadata = {
  title: {
    default: "Craves — Homemade Meals from Trusted Home Chefs",
    template: "%s – Craves",
  },
  description:
    "Discover fresh homemade meals from trusted home chefs near you, delivered through Craves.",
  authors: [{ name: "Craves" }],
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFF8EC",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
