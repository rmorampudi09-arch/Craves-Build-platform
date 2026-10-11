"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { CustomerPageSkeleton } from "@/shared/components/loading/CustomerPageSkeleton";

/** /search?q=biryani opens Home's search with those words (same hand-off as a dish page's search field). */
export default function SearchPage() {
  const router = useRouter();

  useEffect(() => {
    const term = (new URLSearchParams(window.location.search).get("q") ?? "").trim().slice(0, 100);
    try {
      window.sessionStorage.setItem("craves-home-open-search", "1");
      if (term) window.sessionStorage.setItem("craves-home-search-term", term);
      else window.sessionStorage.removeItem("craves-home-search-term");
    } catch {
      // Storage blocked: Home still opens, just without search.
    }
    router.replace("/home");
  }, [router]);

  return <CustomerPageSkeleton variant="home" label="Opening search" />;
}
