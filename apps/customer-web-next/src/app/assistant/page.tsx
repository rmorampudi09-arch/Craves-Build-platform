import type { Metadata } from "next";
import { SupportEmbed } from "@/features/support/components/SupportEmbed";

export const metadata: Metadata = {
  title: "Craves Assistant | Craves",
  robots: { index: false, follow: false },
};

// Framed by the landing page's "Ask Craves" panel (the landing is static HTML, outside the app).
export default function AssistantPage() {
  return (
    <main className="flex h-dvh flex-col bg-white px-3 pb-3">
      <h1 className="sr-only">Craves Assistant</h1>
      <SupportEmbed />
    </main>
  );
}
