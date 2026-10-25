"use client";

import { useEffect, useState } from "react";
import { getKitchenProfile } from "@/shared/lib/kitchen-profile-client";
import type { KitchenProfile } from "@/shared/lib/kitchen-profile-contract";

/** The kitchen's public profile (chef photo, kitchen photos); null while loading, when missing, or when the read fails. */
export function useKitchenProfile(kitchenId: string | null | undefined): { profile: KitchenProfile | null; loading: boolean } {
  const [loaded, setLoaded] = useState<{ id: string; profile: KitchenProfile | null } | null>(null);
  useEffect(() => {
    if (!kitchenId) return;
    let live = true;
    getKitchenProfile(kitchenId).catch(() => null).then(profile => { if (live) setLoaded({ id: kitchenId, profile }); });
    return () => { live = false; };
  }, [kitchenId]);
  const done = !!kitchenId && loaded?.id === kitchenId;
  return { profile: done ? loaded.profile : null, loading: !!kitchenId && !done };
}
