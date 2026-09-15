import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Delivery Intelligence | Craves Admin",
  description: "Read-only operational delivery intelligence for Craves administrators.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
