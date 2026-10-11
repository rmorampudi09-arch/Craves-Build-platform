import type { Metadata } from "next";
import type { ReactNode } from "react";

import { kitchenShareMetadata } from "@/features/seo/lib/share-metadata";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  // Real name and photo make shared links (WhatsApp, Instagram, Facebook) show a rich preview.
  return (await kitchenShareMetadata(id, "kitchens")) ?? { title: "Home kitchen | Craves" };
}

export default function KitchensItemLayout({ children }: { children: ReactNode }) {
  return children;
}
