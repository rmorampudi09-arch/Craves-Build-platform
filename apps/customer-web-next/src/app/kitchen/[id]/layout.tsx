import type { Metadata } from "next";
import type { ReactNode } from "react";

import { kitchenShareMetadata } from "@/features/seo/lib/share-metadata";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  // Real name and photo make shared links (WhatsApp, Instagram, Facebook) show a rich preview.
  // An id the catalog cannot resolve must not become its own indexable page.
  return (await kitchenShareMetadata(id, "kitchen")) ?? { title: "Home kitchen | Craves", robots: { index: false } };
}

export default function KitchenItemLayout({ children }: { children: ReactNode }) {
  return children;
}
